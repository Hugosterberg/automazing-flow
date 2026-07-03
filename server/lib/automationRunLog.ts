/**
 * Server-side helper for appending rows to `public.automation_runs` — the
 * per-execution history that powers the run-status badges on the Automations
 * page (last run + result summary).
 *
 * Fire-and-forget by design (same contract as `syncRunLog` / `activityLog`):
 * failures are logged but never rethrown, so a misbehaving history table can
 * never break the automation it is trying to observe.
 *
 * All writes go through the service-role Supabase client, which bypasses RLS.
 * Pass `businessProfileId` for a per-tenant run (e.g. a manual "run now"), or
 * leave it null for a global cron sweep.
 */

export type AutomationRunStatus = "ok" | "failed";

export interface AutomationRunParams {
  /** Stable automation identifier, matches the cron path segment (e.g. "auto-reply"). */
  automationKey: string;
  /** Null for a global sweep; a business profile id for a per-tenant run. */
  businessProfileId?: string | null;
  status: AutomationRunStatus;
  /** ISO timestamp the run started. */
  startedAt: string;
  /** ISO timestamp the run finished; defaults to now. */
  finishedAt?: string | null;
  /** Short machine-readable result summary (e.g. { sent, skipped, failed }). */
  result?: Record<string, unknown>;
  errorMessage?: string | null;
}

type InsertableClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  };
};

export async function recordAutomationRun(
  supabase: InsertableClient | null | undefined,
  params: AutomationRunParams
): Promise<void> {
  if (!supabase) return;

  const row: Record<string, unknown> = {
    business_profile_id: params.businessProfileId ?? null,
    automation_key: params.automationKey,
    status: params.status,
    started_at: params.startedAt,
    finished_at: params.finishedAt ?? new Date().toISOString(),
    result: params.result ?? {},
    error_message: params.errorMessage ?? null,
  };

  try {
    const { error } = await supabase.from("automation_runs").insert(row);
    if (error) {
      console.warn(
        `[automationRunLog] insert failed (${params.automationKey}/${params.status}):`,
        error.message
      );
    }
  } catch (err) {
    console.warn(
      `[automationRunLog] insert threw (${params.automationKey}/${params.status}):`,
      err instanceof Error ? err.message : err
    );
  }
}
