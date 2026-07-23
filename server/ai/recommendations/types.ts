/**
 * Shared types for the heuristic AI recommendations producer.
 *
 * Heuristics are deterministic functions that read tenant data and emit a
 * list of `RecommendationCandidate`s. The producer (`producer.ts`) then
 * reconciles candidates against the `ai_recommendations` table: new
 * candidates get inserted, unchanged ones are left alone, and live recs whose
 * underlying condition no longer fires get expired.
 */

export type AiRecommendationKind =
  | "content"
  | "outreach"
  | "engagement"
  | "maintenance"
  | "insight";

/**
 * Stable identifier for the heuristic that emitted this candidate. Together
 * with `relatedType` + `relatedId` it acts as the natural key used for
 * idempotency. Adding a new heuristic = adding a new signal id.
 */
export type HeuristicSignal =
  | "reconnect_required"
  | "sync_failed"
  | "stale_sync"
  | "no_integrations"
  | "overdue_task"
  | "engagement_decline"
  | "content_gap"
  | "underperforming_campaign"
  | "high_performing_campaign"
  | "stale_lead";

export interface RecommendationCandidate {
  kind: AiRecommendationKind;
  signal: HeuristicSignal;
  title: string;
  summary?: string;
  rationale?: string;
  confidence?: number;
  module?: string;
  relatedType: string;
  relatedId: string;
  suggestedAction?: Record<string, unknown>;
  context?: Record<string, unknown>;
  /** Optional wall-clock expiry; heuristic recs typically use lifecycle expiry instead. */
  expiresAt?: string | null;
}

export interface ProducerInput {
  businessProfileId: string;
  /**
   * When true, the stochastic LLM content-suggestion layer runs after the
   * deterministic reconcile. Opt-in because LLM calls cost money; only the
   * manual `Generate` endpoint sets this today (cron and reconcile do not).
   */
  includeLlm?: boolean;
}

export interface ProducerResult {
  created: number;
  expired: number;
  unchanged: number;
  /**
   * Non-fatal heuristic errors encountered during this run. Empty when
   * everything completed cleanly. A failing heuristic never aborts the
   * reconcile; it just contributes zero candidates and shows up here.
   */
  errors: string[];
  /**
   * Present only when `includeLlm` was true. `skipped` surfaces reasons why
   * the LLM step was a no-op (missing key, provider error) so the UI can show
   * a helpful toast without treating it as a hard failure.
   */
  llm?: {
    created: number;
    expired: number;
    skipped?: "no_api_key" | "no_signal" | "provider_error" | "cached";
    error?: string;
  };
}
