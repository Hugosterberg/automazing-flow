/**
 * Server-side helper for appending rows to `public.sync_runs` and keeping
 * the denormalised `connected_accounts.last_successful_sync_at` fresh.
 *
 * Fire-and-forget by design: failures are logged but never rethrown, so a
 * misbehaving sync-history table cannot break the main request flow.
 *
 * All writes go through the service-role Supabase client, which bypasses
 * RLS. Caller is responsible for supplying a valid `businessProfileId` the
 * request has already been authorised for (typically via `requireMembership`).
 */

export type SyncRunKind =
  | "full"
  | "delta"
  | "reconcile"
  | "refresh_token"
  | "backfill";

export type SyncRunStatus =
  | "queued"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "cancelled";

export interface SyncRunParams {
  businessProfileId: string;
  connectedAccountId?: string | null;
  kind?: SyncRunKind;
  status: SyncRunStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  itemsProcessed?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * When true AND status === "success", also bump
   * `connected_accounts.last_successful_sync_at` on the referenced row.
   * Ignored when `connectedAccountId` is not supplied.
   */
  updateLastSuccessful?: boolean;
}

type InsertableClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{
        error: { message?: string } | null;
      }>;
    };
  };
};

export async function recordSyncRun(
  supabase: InsertableClient | null | undefined,
  params: SyncRunParams
): Promise<void> {
  if (!supabase) return;

  const row: Record<string, unknown> = {
    business_profile_id: params.businessProfileId,
    connected_account_id: params.connectedAccountId ?? null,
    kind: params.kind ?? "delta",
    status: params.status,
    started_at: params.startedAt ?? null,
    finished_at: params.finishedAt ?? null,
    items_processed: params.itemsProcessed ?? 0,
    error_message: params.errorMessage ?? null,
    metadata: params.metadata ?? {},
  };

  try {
    const { error } = await supabase.from("sync_runs").insert(row);
    if (error) {
      console.warn(
        `[syncRunLog] insert failed (${params.kind ?? "delta"}/${params.status}):`,
        error.message
      );
    }
  } catch (err) {
    console.warn(
      `[syncRunLog] insert threw (${params.kind ?? "delta"}/${params.status}):`,
      err instanceof Error ? err.message : err
    );
  }

  // Denormalise "last successful sync" when applicable. Separate statement so
  // a failure here (e.g. row disappeared) doesn't hide the sync_run insert.
  if (
    params.updateLastSuccessful &&
    params.status === "success" &&
    params.connectedAccountId
  ) {
    try {
      const { error } = await supabase
        .from("connected_accounts")
        .update({
          last_successful_sync_at: params.finishedAt ?? new Date().toISOString(),
        })
        .eq("id", params.connectedAccountId);
      if (error) {
        console.warn(
          "[syncRunLog] last_successful_sync_at update failed:",
          error.message
        );
      }
    } catch (err) {
      console.warn(
        "[syncRunLog] last_successful_sync_at update threw:",
        err instanceof Error ? err.message : err
      );
    }
  }
}
