/**
 * Server-side helper for appending rows to `public.activity_events`.
 *
 * Designed to be fire-and-forget: failures are logged but never rethrown,
 * so a misbehaving audit log cannot break the main request flow.
 *
 * All writes go through the service-role Supabase client, which bypasses
 * RLS. Caller is responsible for supplying a valid business_profile_id
 * that the request has already been authorized for (typically via
 * `requireMembership`).
 */

export type ActivitySeverity = "info" | "success" | "warning" | "error";

export interface ActivityLogParams {
  businessProfileId: string;
  actorUserId?: string | null;
  module: string;
  eventType: string;
  subjectType?: string | null;
  subjectId?: string | null;
  severity?: ActivitySeverity;
  summary: string;
  payload?: Record<string, unknown>;
}

type InsertableClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  };
};

export async function logActivity(
  supabase: InsertableClient | null | undefined,
  params: ActivityLogParams
): Promise<void> {
  if (!supabase) return;

  const row: Record<string, unknown> = {
    business_profile_id: params.businessProfileId,
    actor_user_id: params.actorUserId ?? null,
    module: params.module,
    event_type: params.eventType,
    subject_type: params.subjectType ?? null,
    subject_id: params.subjectId ?? null,
    severity: params.severity ?? "info",
    summary: params.summary,
    payload: params.payload ?? {},
  };

  try {
    const { error } = await supabase.from("activity_events").insert(row);
    if (error) {
      console.warn(
        `[activityLog] insert failed (${params.module}/${params.eventType}):`,
        error.message
      );
    }
  } catch (err) {
    console.warn(
      `[activityLog] insert threw (${params.module}/${params.eventType}):`,
      err instanceof Error ? err.message : err
    );
  }
}
