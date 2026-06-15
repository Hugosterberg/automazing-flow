import { describeZernioFailure, type ZernioModule, type ZernioRawAccount } from "../providers/zernioModule.ts";
import { logActivity } from "../lib/activityLog.ts";
import { recordSyncRun } from "../lib/syncRunLog.ts";
import { generateAiRecommendations } from "../ai/recommendations/producer.ts";

/**
 * /api/connections/* — multi-tenant connection lifecycle.
 *
 * Every route here goes through `requireMembership`, guaranteeing that the
 * request is scoped to a business_profile_id the user belongs to.
 *
 * Routes:
 *   POST /api/connections/reconcile        Re-sync health from Zernio.
 *   POST /api/connections/:id/disconnect   Delete a connection row.
 */

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (column: string, value: unknown) => unknown;
    };
    update: (payload: unknown) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => unknown;
        select: (cols: string) => { single: () => Promise<unknown> };
      };
    };
  };
};

type ConnectionRow = {
  id: string;
  platform: string | null;
  zernio_account_id: string | null;
  disconnected_at: string | null;
  business_profile_id: string | null;
  health: string | null;
};

interface RegisterConnectionsRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: SupabaseLike | null;
  zernio: ZernioModule;
  tokenStore: {
    get: (id: string) => Promise<Record<string, unknown> | null>;
    set: (id: string, value: Record<string, unknown>) => Promise<void>;
    delete: (id: string) => Promise<boolean>;
  };
  getSessionUserId: (req: unknown) => string | null;
}

export function registerConnectionsRoutes(
  app,
  {
    requireMembership,
    supabaseAdmin,
    zernio,
    tokenStore,
    getSessionUserId,
  }: RegisterConnectionsRoutesDeps
) {
  app.post("/api/connections/reconcile", requireMembership, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({
        error: "supabase_service_role_not_configured",
        message: "Connection syncing isn't configured on the server yet. Contact support if this persists.",
      });
    }

    const businessProfileId = String(req.businessProfileId || "");
    const userId = getSessionUserId(req);

    const listing = await zernio.listAccounts();
    if (!listing.ok) {
      const failure = describeZernioFailure(listing);
      return res.status(listing.status >= 400 && listing.status < 600 ? listing.status : 502).json({
        error: failure.code,
        message: failure.message,
        updated: 0,
      });
    }

    const zernioById = new Map<string, ZernioRawAccount>();
    for (const a of listing.accounts) {
      const id = String(a.id || a.accountId || a._id || "").trim();
      if (id) zernioById.set(id, a);
    }

    const sb = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: unknown) => {
            is?: (col: string, val: null) => Promise<{
              data: ConnectionRow[] | null;
              error: Error | null;
            }>;
          };
        };
        update: (p: Record<string, unknown>) => {
          eq: (col: string, val: unknown) => Promise<{ error: Error | null }>;
        };
      };
    };

    const { data, error } = (await sb
      .from("connected_accounts")
      .select("id,platform,zernio_account_id,disconnected_at,business_profile_id,health")
      .eq("business_profile_id", businessProfileId)) as unknown as {
      data: ConnectionRow[] | null;
      error: { message?: string } | null;
    };

    if (error) {
      console.warn("[connections/reconcile] select failed:", error.message);
      return res.status(500).json({
        error: "read_connections_failed",
        message: "Couldn't read your connections from the database. Please try again.",
      });
    }

    const rows: ConnectionRow[] = (data ?? []).filter((r) => !r.disconnected_at);
    let updated = 0;
    const runStart = new Date().toISOString();

    for (const row of rows) {
      const zid = String(row.zernio_account_id || "").trim();
      let nextHealth: string;
      let nextError: string | null = null;

      if (!zid) {
        // Non-Zernio connection: leave alone unless explicitly missing; just touch timestamp.
        nextHealth = row.health || "healthy";
      } else if (zernioById.has(zid)) {
        nextHealth = "healthy";
      } else {
        nextHealth = "expired";
        nextError = "Zernio no longer reports this account. Re-connect required.";
      }

      const runFinish = new Date().toISOString();
      const { error: updErr } = (await sb
        .from("connected_accounts")
        .update({
          health: nextHealth,
          last_synced_at: runFinish,
          last_sync_error: nextError,
        })
        .eq("id", row.id)) as unknown as { error: { message?: string } | null };

      if (updErr) {
        console.warn("[connections/reconcile] update failed:", updErr.message);
        // Record the failed sync attempt so the history reflects reality.
        // Don't continue without logging — drawers show "no runs" otherwise.
        await recordSyncRun(supabaseAdmin as unknown as Parameters<typeof recordSyncRun>[0], {
          businessProfileId,
          connectedAccountId: row.id,
          kind: "reconcile",
          status: "failed",
          startedAt: runStart,
          finishedAt: runFinish,
          itemsProcessed: 0,
          errorMessage: updErr.message ?? "update failed",
          metadata: { zernioKnown: zernioById.has(zid), platform: row.platform },
        });
        // Surface the failure in the per-tenant activity feed too, so the UI
        // timeline shows it without a join into sync_runs.
        await logActivity(supabaseAdmin as unknown as Parameters<typeof logActivity>[0], {
          businessProfileId,
          actorUserId: userId,
          module: "connections",
          eventType: "connection.sync.failed",
          subjectType: "connected_account",
          subjectId: row.id,
          severity: "error",
          summary: `Reconcile failed for ${row.platform ?? "connection"}`,
          payload: {
            kind: "reconcile",
            error: updErr.message ?? "update failed",
            platform: row.platform,
          },
        });
        continue;
      }
      updated += 1;

      // Success = the reconcile check itself completed cleanly. We bump
      // last_successful_sync_at only when the resulting health is healthy —
      // reconciling into an "expired" state is a successful check but not
      // a successful sync of the underlying connection.
      await recordSyncRun(supabaseAdmin as unknown as Parameters<typeof recordSyncRun>[0], {
        businessProfileId,
        connectedAccountId: row.id,
        kind: "reconcile",
        status: "success",
        startedAt: runStart,
        finishedAt: runFinish,
        itemsProcessed: 1,
        errorMessage: nextError,
        metadata: {
          resultingHealth: nextHealth,
          zernioKnown: zernioById.has(zid),
          platform: row.platform,
        },
        updateLastSuccessful: nextHealth === "healthy",
      });
    }

    console.log(
      `[connections/reconcile] user=${userId} bp=${businessProfileId} zernio=${listing.accounts.length} rows=${rows.length} updated=${updated}`
    );

    await logActivity(supabaseAdmin as unknown as Parameters<typeof logActivity>[0], {
      businessProfileId,
      actorUserId: userId,
      module: "connections",
      eventType: "connections.reconciled",
      severity: updated > 0 ? "success" : "info",
      summary: `Reconciled ${updated}/${rows.length} connections`,
      payload: {
        scanned: rows.length,
        updated,
        zernioTotal: listing.accounts.length,
      },
    });

    // Fire-and-forget: refresh heuristic AI recommendations for this tenant.
    // Reconcile is the canonical moment where connection health changes, so
    // re-running the producer here keeps the `/ai-recommendations` page in
    // sync without needing a separate cron. Failures are logged but never
    // surfaced back to the HTTP response — the reconcile itself succeeded.
    void generateAiRecommendations(
      supabaseAdmin as unknown as Parameters<typeof generateAiRecommendations>[0],
      { businessProfileId }
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[connections/reconcile] ai-recommendations refresh failed bp=${businessProfileId}:`,
        message
      );
    });

    return res.json({ ok: true, updated, scanned: rows.length });
  });

  // POST /api/connections/:id/resync — re-check health for a single connection
  app.post(
    "/api/connections/:id/resync",
    requireMembership,
    async (req, res) => {
      if (!supabaseAdmin) {
        return res.status(503).json({
        error: "supabase_service_role_not_configured",
        message: "Connection syncing isn't configured on the server yet. Contact support if this persists.",
      });
      }
      const businessProfileId = String(req.businessProfileId || "");
      const connectionId = String(req.params?.id || "").trim();
      if (!connectionId) return res.status(400).json({ error: "missing_connection_id", message: "No connection was specified." });
      const userId = getSessionUserId(req);

      const sb = supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: unknown) => {
              eq: (col: string, val: unknown) => {
                maybeSingle: () => Promise<{ data: ConnectionRow | null; error: { message?: string } | null }>;
              };
            };
          };
          update: (p: Record<string, unknown>) => {
            eq: (col: string, val: unknown) => Promise<{ error: { message?: string } | null }>;
          };
        };
      };

      const { data: row, error: selErr } = await sb
        .from("connected_accounts")
        .select("id,platform,zernio_account_id,disconnected_at,business_profile_id,health")
        .eq("id", connectionId)
        .eq("business_profile_id", businessProfileId)
        .maybeSingle();

      if (selErr) {
        console.warn("[connections/resync] select failed:", selErr.message);
        return res.status(500).json({
          error: "resync_read_failed",
          message: "Couldn't load that connection. Please try again.",
        });
      }
      if (!row) {
        return res.status(404).json({
          error: "connection_not_found",
          message: "That connection no longer exists. Refresh and try again.",
        });
      }

      const listing = await zernio.listAccounts();
      const runStart = new Date().toISOString();
      const zid = String(row.zernio_account_id || "").trim();

      // A Zernio-backed connection can't be health-checked while Zernio
      // itself is unreachable — defaulting to "healthy" would silently
      // clear a real expired/error state. Surface the failure instead.
      if (zid && !listing.ok) {
        const failure = describeZernioFailure(listing);
        return res
          .status(listing.status >= 400 && listing.status < 600 ? listing.status : 502)
          .json({ error: failure.code, message: failure.message });
      }

      let nextHealth = "healthy";
      let nextError: string | null = null;

      if (listing.ok && zid) {
        const known = listing.accounts.some((a) => {
          const id = String(a.id || a.accountId || a._id || "").trim();
          return id === zid;
        });
        if (!known) {
          nextHealth = "expired";
          nextError = "Zernio no longer reports this account. Re-connect required.";
        }
      }

      const runFinish = new Date().toISOString();
      const { error: updErr } = await sb
        .from("connected_accounts")
        .update({ health: nextHealth, last_synced_at: runFinish, last_sync_error: nextError })
        .eq("id", connectionId);

      if (updErr) {
        console.warn("[connections/resync] update failed:", updErr.message);
        return res.status(500).json({
          error: "resync_update_failed",
          message: "Couldn't save the connection's status. Please try again.",
        });
      }

      await recordSyncRun(supabaseAdmin as unknown as Parameters<typeof recordSyncRun>[0], {
        businessProfileId,
        connectedAccountId: connectionId,
        kind: "reconcile",
        status: "success",
        startedAt: runStart,
        finishedAt: runFinish,
        itemsProcessed: 1,
        errorMessage: nextError,
        metadata: { resultingHealth: nextHealth, platform: row.platform },
        updateLastSuccessful: nextHealth === "healthy",
      });

      await logActivity(supabaseAdmin as unknown as Parameters<typeof logActivity>[0], {
        businessProfileId,
        actorUserId: userId,
        module: "connections",
        eventType: "connection.sync.completed",
        subjectType: "connected_account",
        subjectId: connectionId,
        severity: nextHealth === "healthy" ? "success" : "warning",
        summary: `Resynced ${row.platform ?? "connection"}: ${nextHealth}`,
        payload: { health: nextHealth, platform: row.platform },
      });

      return res.json({ ok: true, health: nextHealth });
    }
  );

  app.post(
    "/api/connections/:id/disconnect",
    requireMembership,
    async (req, res) => {
      if (!supabaseAdmin) {
        return res.status(503).json({
        error: "supabase_service_role_not_configured",
        message: "Connection syncing isn't configured on the server yet. Contact support if this persists.",
      });
      }
      const businessProfileId = String(req.businessProfileId || "");
      const connectionId = String(req.params?.id || "").trim();
      if (!connectionId) {
        return res.status(400).json({ error: "missing_connection_id", message: "No connection was specified." });
      }

      const sb = supabaseAdmin as unknown as {
        from: (t: string) => {
          delete: () => {
            eq: (col: string, val: unknown) => {
              eq: (col: string, val: unknown) => Promise<{
                error: { message?: string } | null;
              }>;
            };
          };
        };
      };

      const { error } = await sb
        .from("connected_accounts")
        .delete()
        .eq("id", connectionId)
        .eq("business_profile_id", businessProfileId);

      if (error) {
        console.warn("[connections/disconnect] delete failed:", error.message);
        return res.status(500).json({
          error: "disconnect_failed",
          message: "Couldn't disconnect that account. Please try again.",
        });
      }

      // Also drop any server-side OAuth token entry so provider API calls stop.
      try {
        await tokenStore.delete(connectionId);
      } catch {
        // Token store is a best-effort cleanup.
      }

      await logActivity(supabaseAdmin as unknown as Parameters<typeof logActivity>[0], {
        businessProfileId,
        actorUserId: getSessionUserId(req),
        module: "connections",
        eventType: "connection.disconnected",
        subjectType: "connected_account",
        subjectId: connectionId,
        severity: "info",
        summary: `Disconnected connection ${connectionId}`,
      });

      return res.json({ ok: true });
    }
  );
}
