/**
 * AI recommendations producer — reconciles heuristic output against the
 * `ai_recommendations` table.
 *
 * Algorithm:
 *   1. Snapshot the tenant's connected accounts and open tasks.
 *   2. Run every heuristic (isolated try/catch per rule) to produce a set
 *      of `RecommendationCandidate`s.
 *   3. Load all currently "live" recs for this tenant (status ∈ new|seen).
 *   4. For each candidate:
 *        - if a matching live rec exists (same relatedType + relatedId +
 *          context.signal) → unchanged
 *        - otherwise → insert a new rec with status=new
 *   5. For each live rec that has no matching candidate → mark as expired
 *      (the underlying condition resolved, e.g. sync recovered).
 *   6. Emit an `activity_events` row summarising the run.
 *
 * Idempotent: running multiple times in a row is a no-op when nothing
 * changed.
 *
 * All DB access goes through the service-role client so RLS is bypassed.
 * The caller is responsible for having authorised the business_profile_id
 * (the HTTP route does this via `requireMembership`).
 */

import { logActivity } from "../../lib/activityLog.ts";
import {
  runAllHeuristics,
  type AccountSnapshot,
  type TaskSnapshot,
  type TenantSnapshot,
} from "./heuristics.ts";
import { regenerateLlmContentSuggestions } from "./llm/contentSuggestions.ts";
import type {
  ProducerInput,
  ProducerResult,
  RecommendationCandidate,
} from "./types.ts";

/**
 * Minimal Supabase client surface we need. Using the real SupabaseClient
 * type from `@supabase/supabase-js` would pull the full generic into this
 * module; the local shape covers `.select(...).eq(...).in(...)` and
 * `.insert(...)` / `.update(...).in(...)` which is all we use here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder chain is intentionally untyped for brevity
type SupabaseLike = { from: (table: string) => any };

const CONNECTED_ACCOUNTS_COLS = [
  "id",
  "platform",
  "username",
  "display_name",
  "health",
  "last_sync_error",
  "last_successful_sync_at",
  "connected_at",
  "disconnected_at",
].join(",");

const TASKS_COLS = [
  "id",
  "title",
  "status",
  "due_at",
  "priority",
  "module",
].join(",");

const OPEN_TASK_STATUSES = ["open", "in_progress", "blocked"] as const;

interface LiveRecRow {
  id: string;
  related_type: string | null;
  related_id: string | null;
  context: Record<string, unknown> | null;
}

function candidateKey(c: RecommendationCandidate): string {
  return `${c.relatedType}|${c.relatedId}|${c.signal}`;
}

function liveRecKey(row: LiveRecRow): string | null {
  const signal =
    row.context && typeof row.context === "object"
      ? String((row.context as Record<string, unknown>).signal ?? "")
      : "";
  if (!row.related_type || !row.related_id || !signal) return null;
  return `${row.related_type}|${row.related_id}|${signal}`;
}

async function loadAccountSnapshot(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<AccountSnapshot[]> {
  const { data, error } = await supabase
    .from("connected_accounts")
    .select(CONNECTED_ACCOUNTS_COLS)
    .eq("business_profile_id", businessProfileId);
  if (error) {
    throw new Error(`connected_accounts lookup failed: ${error.message}`);
  }
  return Array.isArray(data) ? (data as AccountSnapshot[]) : [];
}

async function loadTaskSnapshot(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<TaskSnapshot[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASKS_COLS)
    .eq("business_profile_id", businessProfileId)
    .in("status", OPEN_TASK_STATUSES as unknown as string[]);
  if (error) {
    // Tasks are a best-effort signal — a failure here should not block the
    // rest of the producer. Log and continue with an empty list.
    console.warn(
      `[ai-recommendations] tasks lookup failed bp=${businessProfileId}:`,
      error.message
    );
    return [];
  }
  return Array.isArray(data) ? (data as TaskSnapshot[]) : [];
}

async function loadLiveRecs(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<LiveRecRow[]> {
  const { data, error } = await supabase
    .from("ai_recommendations")
    .select("id, related_type, related_id, context")
    .eq("business_profile_id", businessProfileId)
    .in("status", ["new", "seen"]);
  if (error) {
    throw new Error(`ai_recommendations lookup failed: ${error.message}`);
  }
  return Array.isArray(data) ? (data as LiveRecRow[]) : [];
}

async function insertCandidates(
  supabase: SupabaseLike,
  businessProfileId: string,
  candidates: RecommendationCandidate[]
): Promise<number> {
  if (candidates.length === 0) return 0;

  const rows = candidates.map((c) => ({
    business_profile_id: businessProfileId,
    kind: c.kind,
    status: "new" as const,
    title: c.title,
    summary: c.summary ?? null,
    rationale: c.rationale ?? null,
    confidence: c.confidence ?? null,
    module: c.module ?? null,
    related_type: c.relatedType,
    related_id: c.relatedId,
    suggested_action: c.suggestedAction ?? {},
    context: { ...(c.context ?? {}), signal: c.signal },
    expires_at: c.expiresAt ?? null,
  }));

  const { error } = await supabase.from("ai_recommendations").insert(rows);
  if (error) {
    throw new Error(`ai_recommendations insert failed: ${error.message}`);
  }
  return rows.length;
}

async function expireRecs(
  supabase: SupabaseLike,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error } = await supabase
    .from("ai_recommendations")
    .update({ status: "expired" })
    .in("id", ids);
  if (error) {
    throw new Error(`ai_recommendations expire failed: ${error.message}`);
  }
  return ids.length;
}

export async function generateAiRecommendations(
  supabase: SupabaseLike,
  input: ProducerInput
): Promise<ProducerResult> {
  const [accounts, tasks] = await Promise.all([
    loadAccountSnapshot(supabase, input.businessProfileId),
    loadTaskSnapshot(supabase, input.businessProfileId),
  ]);

  const snapshot: TenantSnapshot = {
    businessProfileId: input.businessProfileId,
    accounts,
    tasks,
  };

  const { candidates, errors } = runAllHeuristics(snapshot);
  const liveRecs = await loadLiveRecs(supabase, input.businessProfileId);

  const liveByKey = new Map<string, LiveRecRow>();
  for (const row of liveRecs) {
    const key = liveRecKey(row);
    if (key) liveByKey.set(key, row);
  }

  const candidateKeys = new Set<string>();
  const toInsert: RecommendationCandidate[] = [];
  for (const c of candidates) {
    const key = candidateKey(c);
    // De-dupe within a single run (e.g. two heuristics accidentally producing
    // the same key — shouldn't happen today but is cheap to guard against).
    if (candidateKeys.has(key)) continue;
    candidateKeys.add(key);
    if (!liveByKey.has(key)) {
      toInsert.push(c);
    }
  }

  const toExpire: string[] = [];
  for (const [key, row] of liveByKey.entries()) {
    if (!candidateKeys.has(key)) {
      toExpire.push(row.id);
    }
  }

  const [created, expired] = await Promise.all([
    insertCandidates(supabase, input.businessProfileId, toInsert),
    expireRecs(supabase, toExpire),
  ]);

  const unchanged = candidateKeys.size - created;

  // Optional LLM layer. Runs AFTER the deterministic reconcile so that:
  //   - LLM failures never block maintenance recs from being created.
  //   - LLM output sits in a dedicated `module = ai_content_llm` row and is
  //     reconciled with its own expire-all-then-insert strategy, independent
  //     of the heuristic natural-key matching above.
  let llmResult: ProducerResult["llm"];
  let totalCreated = created;
  let totalExpired = expired;
  if (input.includeLlm) {
    const llm = await regenerateLlmContentSuggestions(supabase, {
      businessProfileId: input.businessProfileId,
    });
    llmResult = llm;
    totalCreated += llm.created;
    totalExpired += llm.expired;
  }

  const result: ProducerResult = {
    created: totalCreated,
    expired: totalExpired,
    unchanged,
    errors,
    ...(llmResult ? { llm: llmResult } : {}),
  };

  // Only emit an activity row when something actually changed or when there
  // were heuristic errors. Idempotent no-op runs would otherwise spam the
  // feed on every reconcile.
  const meaningful =
    totalCreated > 0 || totalExpired > 0 || errors.length > 0;
  if (meaningful) {
    await logActivity(
      supabase as unknown as Parameters<typeof logActivity>[0],
      {
        businessProfileId: input.businessProfileId,
        module: "ai_recommendations",
        eventType: "ai_recommendations.generated",
        severity: errors.length > 0 ? "warning" : "info",
        summary:
          errors.length > 0
            ? `AI recs updated (+${totalCreated}/-${totalExpired}) with ${errors.length} heuristic error(s)`
            : `AI recs updated (+${totalCreated}/-${totalExpired})`,
        payload: {
          created: totalCreated,
          expired: totalExpired,
          unchanged,
          errorCount: errors.length,
          errorPreview: errors.slice(0, 3),
          llm: llmResult ?? null,
        },
      }
    );
  }

  return result;
}
