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
import { loadProfileDocument } from "../../lib/profileDocumentStore.ts";
import { parseScheduledPostsDoc } from "../../lib/scheduledPostsPublisher.ts";
import { countUpcomingPosts } from "../../lib/contentCreativeJobs.ts";
import {
  runAllHeuristics,
  prettyAccountLabel,
  type AccountSnapshot,
  type CampaignSnapshot,
  type LeadSnapshot,
  type SocialEngagementTrend,
  type TaskSnapshot,
  type TenantSnapshot,
} from "./heuristics.ts";
import { regenerateLlmContentSuggestions } from "./llm/contentSuggestions.ts";
import type {
  ProducerInput,
  ProducerResult,
  RecommendationCandidate,
} from "./types.ts";

import type { SupabaseAdminLike as SupabaseLike } from "../../lib/supabaseAdminLike.ts";

/** Snapshots older than this are outside the engagement-trend lookback window. */
const ENGAGEMENT_TREND_LOOKBACK_DAYS = 15;
/** How close to the ideal 7-day-back baseline a snapshot has to be to qualify. */
const ENGAGEMENT_TREND_TARGET_SPAN_DAYS = 7;
/** How far ahead to look when counting "upcoming" posts for the content-gap heuristic. */
const UPCOMING_POSTS_HORIZON_HOURS = 72;
/** How many recent campaign snapshot rows to scan per tenant (dedupe keeps only the latest per campaign). */
const CAMPAIGN_SNAPSHOT_SCAN_LIMIT = 200;

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

interface SocialStatsSnapshotRow {
  account_id: string;
  platform: string | null;
  engagement_rate: number | null;
  snapshot_date: string;
}

/**
 * Week-over-week engagement trend per social account, from the daily
 * `social_stats_snapshots` the cron writes. Mirrors the client-side trend
 * computation in `src/features/social/socialStatsTrend.ts` but stays
 * server-only since that module imports browser-only helpers.
 */
async function loadSocialEngagementTrends(
  supabase: SupabaseLike,
  businessProfileId: string,
  accounts: AccountSnapshot[]
): Promise<SocialEngagementTrend[]> {
  const sinceDate = new Date(Date.now() - ENGAGEMENT_TREND_LOOKBACK_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from("social_stats_snapshots")
    .select("account_id,platform,engagement_rate,snapshot_date")
    .eq("business_profile_id", businessProfileId)
    .gte("snapshot_date", sinceDate);
  if (error) {
    console.warn(
      `[ai-recommendations] social_stats_snapshots lookup failed bp=${businessProfileId}:`,
      error.message
    );
    return [];
  }

  const byAccount = new Map<string, SocialStatsSnapshotRow[]>();
  for (const row of (Array.isArray(data) ? data : []) as SocialStatsSnapshotRow[]) {
    if (row.engagement_rate == null) continue;
    const list = byAccount.get(row.account_id) ?? [];
    list.push(row);
    byAccount.set(row.account_id, list);
  }

  const labelByAccount = new Map(accounts.map((a) => [a.id, prettyAccountLabel(a)]));
  const trends: SocialEngagementTrend[] = [];
  for (const [accountId, snapshots] of byAccount.entries()) {
    const sorted = snapshots
      .filter((s) => Number.isFinite(Date.parse(s.snapshot_date)))
      .sort((a, b) => Date.parse(b.snapshot_date) - Date.parse(a.snapshot_date));
    if (sorted.length < 2) continue;
    const latest = sorted[0];
    const latestMs = Date.parse(latest.snapshot_date);
    const targetMs = latestMs - ENGAGEMENT_TREND_TARGET_SPAN_DAYS * 86400000;
    const baseline = sorted.find((s) => Date.parse(s.snapshot_date) <= targetMs) ?? sorted[sorted.length - 1];
    const baselineMs = Date.parse(baseline.snapshot_date);
    if (baselineMs >= latestMs) continue;
    trends.push({
      accountId,
      platform: latest.platform,
      label: labelByAccount.get(accountId) ?? (latest.platform ? latest.platform.replace(/_/g, " ") : "account"),
      latestEngagementRate: latest.engagement_rate!,
      baselineEngagementRate: baseline.engagement_rate!,
      spanDays: Math.max(1, Math.round((latestMs - baselineMs) / 86400000)),
    });
  }
  return trends;
}

/**
 * Posts scheduled or drafted within the content-gap horizon, across all
 * accounts. Returns `null` (rather than throwing) on a lookup failure so a
 * transient DB error can't crash the whole recommendations run — the
 * content-gap heuristic treats `null` as "unknown" and stays silent instead
 * of firing a false positive.
 */
async function loadUpcomingPostsCount(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<number | null> {
  try {
    const doc = await loadProfileDocument(supabase, businessProfileId, "scheduled-posts");
    const posts = parseScheduledPostsDoc(doc?.data);
    return countUpcomingPosts(posts, Date.now(), UPCOMING_POSTS_HORIZON_HOURS);
  } catch (err) {
    console.warn(
      `[ai-recommendations] scheduled-posts lookup failed bp=${businessProfileId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

interface CampaignSnapshotRow {
  campaign_id: string;
  campaign_name: string | null;
  platform: string;
  roas: number | null;
  grade: string | null;
  spend: number | null;
}

/** Latest snapshot per ad campaign, from the nightly `marketing_campaign_snapshots` cron. */
async function loadLatestCampaignSnapshots(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<CampaignSnapshot[]> {
  const { data, error } = await supabase
    .from("marketing_campaign_snapshots")
    .select("campaign_id,campaign_name,platform,roas,grade,spend,snapshot_date")
    .eq("business_profile_id", businessProfileId)
    .order("snapshot_date", { ascending: false })
    .limit(CAMPAIGN_SNAPSHOT_SCAN_LIMIT);
  if (error) {
    console.warn(
      `[ai-recommendations] marketing_campaign_snapshots lookup failed bp=${businessProfileId}:`,
      error.message
    );
    return [];
  }

  const seen = new Set<string>();
  const result: CampaignSnapshot[] = [];
  for (const row of (Array.isArray(data) ? data : []) as CampaignSnapshotRow[]) {
    if (!row.campaign_id || seen.has(row.campaign_id)) continue;
    seen.add(row.campaign_id);
    result.push({
      campaignId: row.campaign_id,
      platform: row.platform,
      name: row.campaign_name || "Untitled campaign",
      roas7d: row.roas,
      grade: row.grade,
      spend7d: row.spend,
    });
  }
  return result;
}

const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"];

interface LeadRow {
  id: string;
  name: string | null;
  company: string | null;
  status: string | null;
  next_follow_up_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

/** Open leads in the pipeline, for the stale-lead heuristic. Best-effort like the task snapshot. */
async function loadLeadSnapshot(
  supabase: SupabaseLike,
  businessProfileId: string
): Promise<LeadSnapshot[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("id,name,company,status,next_follow_up_at,updated_at,created_at")
    .eq("business_profile_id", businessProfileId)
    .in("status", OPEN_LEAD_STATUSES);
  if (error) {
    console.warn(`[ai-recommendations] leads lookup failed bp=${businessProfileId}:`, error.message);
    return [];
  }
  return ((Array.isArray(data) ? data : []) as LeadRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    status: row.status,
    nextFollowUpAt: row.next_follow_up_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }));
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

  const [socialEngagementTrends, upcomingPostsCount, campaigns, leads] = await Promise.all([
    loadSocialEngagementTrends(supabase, input.businessProfileId, accounts),
    loadUpcomingPostsCount(supabase, input.businessProfileId),
    loadLatestCampaignSnapshots(supabase, input.businessProfileId),
    loadLeadSnapshot(supabase, input.businessProfileId),
  ]);

  const snapshot: TenantSnapshot = {
    businessProfileId: input.businessProfileId,
    accounts,
    tasks,
    socialEngagementTrends,
    upcomingPostsCount,
    campaigns,
    leads,
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
