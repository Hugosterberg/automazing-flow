import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client-side helper for appending rows to `public.activity_events`.
 *
 * Fire-and-forget: failures are only warned. Callers do not need to
 * await the result for correctness — await is only useful in tests.
 *
 * RLS on `activity_events` requires `is_member(business_profile_id)`, so
 * callers must pass a business_profile_id the signed-in user belongs to.
 */

export type ActivitySeverity = "info" | "success" | "warning" | "error";

export interface ActivityLogParams {
  businessProfileId: string;
  module: string;
  eventType: string;
  subjectType?: string | null;
  subjectId?: string | null;
  severity?: ActivitySeverity;
  summary: string;
  payload?: Record<string, unknown>;
}

export async function logActivity(
  supabase: SupabaseClient,
  params: ActivityLogParams
): Promise<void> {
  try {
    const { error } = await supabase.from("activity_events").insert({
      business_profile_id: params.businessProfileId,
      module: params.module,
      event_type: params.eventType,
      subject_type: params.subjectType ?? null,
      subject_id: params.subjectId ?? null,
      severity: params.severity ?? "info",
      summary: params.summary,
      payload: params.payload ?? {},
    });
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
