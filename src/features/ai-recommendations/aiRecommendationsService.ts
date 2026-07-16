import type { TypedSupabaseClient } from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/types/supabase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { t } from "@/lib/i18n";

export type AiRecommendationRow = Tables<"ai_recommendations">;
export type AiRecommendationKind = AiRecommendationRow["kind"];
export type AiRecommendationStatus = AiRecommendationRow["status"];

export const AI_REC_KIND_ORDER: AiRecommendationKind[] = [
  "content",
  "outreach",
  "engagement",
  "maintenance",
  "insight",
];

export const AI_REC_STATUS_ORDER: AiRecommendationStatus[] = [
  "new",
  "seen",
  "accepted",
  "dismissed",
  "expired",
];

export const AI_REC_KIND_LABELS: Record<AiRecommendationKind, string> = {
  content: "Content",
  outreach: "Outreach",
  engagement: "Engagement",
  maintenance: "Maintenance",
  insight: "Insight",
};

export const AI_REC_STATUS_LABELS: Record<AiRecommendationStatus, string> = {
  new: "New",
  seen: "Seen",
  accepted: "Accepted",
  dismissed: "Dismissed",
  expired: "Expired",
};

/**
 * List recommendations for a business profile. Excludes `expired` by default
 * so the UI doesn't need to filter client-side — expired is a housekeeping
 * status set by a future server job when `expires_at` passes.
 */
export async function listAiRecommendations(
  supabase: TypedSupabaseClient,
  businessProfileId: string,
  options: { includeExpired?: boolean } = {}
): Promise<AiRecommendationRow[]> {
  let q = supabase
    .from("ai_recommendations")
    .select("*")
    .eq("business_profile_id", businessProfileId)
    .order("created_at", { ascending: false });

  if (!options.includeExpired) {
    q = q.neq("status", "expired");
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Result envelope returned by the server-side producer. Mirrors the
 * `ProducerResult` shape in `server/ai/recommendations/types.ts` — we keep
 * it duplicated (not imported) so the client bundle never reaches into
 * server code.
 */
export interface GenerateAiRecommendationsResult {
  created: number;
  expired: number;
  unchanged: number;
  errors?: string[];
  /**
   * Present when the LLM layer ran. `skipped` is set (without `error`) when
   * the layer was a benign no-op — e.g. no API key configured. `error` is
   * set when the provider call failed; the rest of the producer still
   * completes so the heuristic counts above are still valid.
   */
  llm?: {
    created: number;
    expired: number;
    skipped?: "no_api_key" | "no_signal" | "provider_error" | "cached";
    error?: string;
  };
}

/**
 * Trigger the server-side heuristic producer for the given business
 * profile. The endpoint is idempotent — running it twice without any data
 * change returns `{ created: 0, expired: 0, unchanged: N }`.
 *
 * Note: this talks to the Express server, not Supabase. Authentication
 * uses the existing `auth_session` cookie.
 */
export async function generateAiRecommendations(
  businessProfileId: string
): Promise<GenerateAiRecommendationsResult> {
  const res = await fetchWithTimeout("/api/ai-recommendations/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Body wasn't JSON — fall through to the status-based error below.
  }
  if (!res.ok) {
    throw new Error(
      apiErrorMessage(body, t("aiRecommendations:service.generateFailed", { status: res.status }))
    );
  }
  const result = (body ?? {}) as GenerateAiRecommendationsResult;
  return {
    created: Number(result.created ?? 0),
    expired: Number(result.expired ?? 0),
    unchanged: Number(result.unchanged ?? 0),
    errors: Array.isArray(result.errors) ? result.errors : undefined,
    llm:
      result.llm && typeof result.llm === "object"
        ? {
            created: Number(result.llm.created ?? 0),
            expired: Number(result.llm.expired ?? 0),
            skipped: result.llm.skipped,
            error:
              typeof result.llm.error === "string"
                ? result.llm.error
                : undefined,
          }
        : undefined,
  };
}

/**
 * Transition a recommendation to a new status. Used for:
 * - new → seen  (user opened / viewed)
 * - new|seen → accepted  (user chose to act)
 * - new|seen → dismissed (user rejected)
 * Does not handle `expired` — that's a server-side lifecycle.
 */
export async function setAiRecommendationStatus(
  supabase: TypedSupabaseClient,
  id: string,
  status: AiRecommendationStatus
): Promise<AiRecommendationRow> {
  const patch: TablesUpdate<"ai_recommendations"> = { status };
  const { data, error } = await supabase
    .from("ai_recommendations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
