/**
 * Scheduled / on-demand maintenance (Vercel Cron, manual curl, etc.).
 *
 * Every endpoint requires `Authorization: Bearer <CRON_SECRET>` — the same
 * header Vercel Cron sends automatically when `CRON_SECRET` is configured
 * on the project. When the secret is unset the endpoints fail closed (401)
 * so a half-deployed environment can't silently run housekeeping jobs.
 */

import { generateAiRecommendations } from "../ai/recommendations/producer.ts";
import { runAutoReplyForAllProfiles } from "../automation/autoReply.ts";

/**
 * Guard: returns true when the incoming request is authorised to run a
 * cron job. Fails closed when CRON_SECRET is missing. Keeping this inline
 * (not a middleware) so each endpoint can own its own error envelope.
 */
function isAuthorisedCron(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = String(req.headers.authorization || "").trim();
  return auth === `Bearer ${secret}`;
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   oauthPendingStore: { deleteExpired?: () => Promise<{ removed: number }> };
 *   supabaseAdmin?: unknown;
 *   zernio?: unknown;
 *   secretResolver?: { resolve: (businessProfileId: string, key: string) => Promise<string | null> };
 * }} deps
 */
export function registerCronRoutes(app, deps) {
  const { oauthPendingStore, supabaseAdmin, zernio, secretResolver } = deps;

  app.get("/api/cron/cleanup-oauth-pending", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = oauthPendingStore.deleteExpired
        ? await oauthPendingStore.deleteExpired()
        : { removed: 0 };
      return res.json({ ok: true, removed: result.removed ?? 0 });
    } catch (e) {
      console.error("[cron] cleanup-oauth-pending:", e?.message || e);
      return res.status(500).json({ error: "cleanup_failed" });
    }
  });

  /**
   * Walks every active business_profile and re-runs the heuristic AI
   * recommendations producer. Complements the `connections/reconcile`
   * auto-trigger: reconcile only fires when a user clicks resync, while
   * this cron keeps stale_sync and overdue_task recs fresh even for
   * inactive tenants.
   *
   * Per-tenant failures are isolated — one bad bp cannot abort the run.
   * The response summarises what happened so cron logs are inspectable.
   */
  app.get("/api/cron/refresh-ai-recommendations", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin) {
      return res
        .status(503)
        .json({ error: "supabase_service_role_not_configured" });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("business_profiles")
        .select("id")
        .eq("status", "active");

      if (error) {
        console.error(
          "[cron] refresh-ai-recommendations select failed:",
          error.message
        );
        return res.status(500).json({ error: "list_profiles_failed" });
      }

      const profiles = Array.isArray(data) ? data : [];
      const summary = [];
      let totalCreated = 0;
      let totalExpired = 0;
      let failedTenants = 0;

      for (const row of profiles) {
        const businessProfileId = String(row?.id || "").trim();
        if (!businessProfileId) continue;
        try {
          const result = await generateAiRecommendations(supabaseAdmin, {
            businessProfileId,
          });
          totalCreated += result.created;
          totalExpired += result.expired;
          summary.push({
            businessProfileId,
            created: result.created,
            expired: result.expired,
            unchanged: result.unchanged,
            heuristicErrors: result.errors.length,
          });
        } catch (err) {
          failedTenants += 1;
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[cron] refresh-ai-recommendations bp=${businessProfileId} failed:`,
            message
          );
          summary.push({
            businessProfileId,
            error: message.slice(0, 200),
          });
        }
      }

      console.log(
        `[cron] refresh-ai-recommendations: scanned=${profiles.length} created=${totalCreated} expired=${totalExpired} failedTenants=${failedTenants}`
      );

      return res.json({
        ok: true,
        scanned: profiles.length,
        created: totalCreated,
        expired: totalExpired,
        failedTenants,
        summary,
      });
    } catch (e) {
      console.error(
        "[cron] refresh-ai-recommendations unexpected:",
        e?.message || e
      );
      return res.status(500).json({ error: "refresh_failed" });
    }
  });

  /**
   * Auto-reply automation sweep: for every business_profile with
   * `automation_settings.dm_auto_reply_enabled`, draft (or send, per the
   * profile's mode) AI replies to unread Zernio inbox conversations.
   * Idempotent via auto_reply_log — safe to trigger as often as you like
   * (Vercel Cron on Pro, or any external scheduler with the CRON_SECRET).
   */
  app.get("/api/cron/auto-reply", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !zernio || !secretResolver) {
      return res
        .status(503)
        .json({ error: "auto_reply_dependencies_not_configured" });
    }

    try {
      const result = await runAutoReplyForAllProfiles({
        supabaseAdmin,
        zernio,
        resolveOpenAiKey: (bpId) => secretResolver.resolve(bpId, "OPENAI_API_KEY"),
      });
      const totals = result.summaries.reduce(
        (acc, s) => ({
          drafted: acc.drafted + s.drafted,
          sent: acc.sent + s.sent,
          failed: acc.failed + s.failed,
        }),
        { drafted: 0, sent: 0, failed: 0 }
      );
      console.log(
        `[cron] auto-reply: profiles=${result.profiles} drafted=${totals.drafted} sent=${totals.sent} failed=${totals.failed} skippedForTime=${result.skippedForTime}`
      );
      return res.json({
        ok: true,
        profiles: result.profiles,
        skippedForTime: result.skippedForTime,
        ...totals,
        summaries: result.summaries,
      });
    } catch (e) {
      console.error("[cron] auto-reply unexpected:", e?.message || e);
      return res.status(500).json({ error: "auto_reply_failed" });
    }
  });
}
