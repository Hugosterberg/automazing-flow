/**
 * Heuristic rules that emit `RecommendationCandidate`s for a business
 * profile. Each heuristic is a pure function over a tenant snapshot.
 *
 * Heuristics live separately from the producer so adding a new rule is
 * a one-file change and doesn't risk breaking the reconcile loop.
 *
 * Adding a new heuristic:
 *   1. Define a new `HeuristicSignal` id in `./types.ts`.
 *   2. Add a function here that accepts the relevant slice of the snapshot
 *      and returns `RecommendationCandidate[]`.
 *   3. Register it in `ALL_HEURISTICS` below.
 */

import type { RecommendationCandidate } from "./types.ts";

// ---------------------------------------------------------------------------
// Tuning constants — surfaced here so thresholds are easy to find and tune.
// ---------------------------------------------------------------------------

/** Accounts healthy for longer than this without a successful sync are "stale". */
const STALE_SYNC_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** Hard cap on `overdue_task` recs emitted per run to avoid flooding the feed. */
const OVERDUE_TASKS_CAP = 10;

// ---------------------------------------------------------------------------
// Snapshot input shapes
// ---------------------------------------------------------------------------

export type AccountSnapshot = {
  id: string;
  platform: string | null;
  username: string | null;
  display_name: string | null;
  health: string | null;
  last_sync_error: string | null;
  last_successful_sync_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
};

export type TaskSnapshot = {
  id: string;
  title: string | null;
  status: string | null;
  due_at: string | null;
  priority: string | null;
  module: string | null;
};

export interface TenantSnapshot {
  businessProfileId: string;
  accounts: AccountSnapshot[];
  tasks: TaskSnapshot[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function prettyAccountLabel(acc: AccountSnapshot): string {
  const platformLabel = acc.platform
    ? acc.platform.replace(/_/g, " ")
    : "account";
  const handle = acc.display_name || acc.username;
  return handle ? `${platformLabel} (${handle})` : platformLabel;
}

function isActive(acc: AccountSnapshot): boolean {
  return !acc.disconnected_at;
}

function parseIso(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Heuristic rules
// ---------------------------------------------------------------------------

/**
 * Emit a "reconnect required" candidate when the account is in a health
 * state that requires user intervention (expired tokens, revoked access).
 */
export function reconnectRequiredHeuristic(
  snapshot: TenantSnapshot
): RecommendationCandidate[] {
  return snapshot.accounts
    .filter(isActive)
    .filter(
      (a) => a.health === "reconnect_required" || a.health === "expired"
    )
    .map((a) => ({
      kind: "maintenance",
      signal: "reconnect_required",
      title: `Reconnect ${prettyAccountLabel(a)}`,
      summary: `${prettyAccountLabel(a)} needs to be reconnected to keep syncing.`,
      rationale:
        "The provider's access has expired or been revoked. Without a fresh connection, automations and analytics for this account will stop working.",
      confidence: 0.95,
      module: "connections",
      relatedType: "connected_account",
      relatedId: a.id,
      suggestedAction: { type: "navigate", to: "/integrations" },
      context: {
        signal: "reconnect_required",
        platform: a.platform,
        health: a.health,
      },
    }));
}

/**
 * Emit a "sync failed" candidate when the account has a persisted
 * `last_sync_error` and is not currently healthy. Healthy accounts with a
 * stale error string are ignored (the error was resolved by a later sync).
 * Also skip accounts already covered by `reconnect_required` so we don't
 * double-up recs for the same connection.
 */
export function syncFailedHeuristic(
  snapshot: TenantSnapshot
): RecommendationCandidate[] {
  return snapshot.accounts
    .filter(isActive)
    .filter((a) => a.last_sync_error && a.health !== "healthy")
    .filter(
      (a) => a.health !== "reconnect_required" && a.health !== "expired"
    )
    .map((a) => ({
      kind: "maintenance",
      signal: "sync_failed",
      title: `Fix sync error on ${prettyAccountLabel(a)}`,
      summary: `The last sync for ${prettyAccountLabel(a)} failed.`,
      rationale: a.last_sync_error
        ? `Provider returned: ${a.last_sync_error.slice(0, 200)}`
        : "The provider returned an error on the last sync attempt.",
      confidence: 0.8,
      module: "connections",
      relatedType: "connected_account",
      relatedId: a.id,
      suggestedAction: { type: "navigate", to: "/integrations" },
      context: {
        signal: "sync_failed",
        platform: a.platform,
        health: a.health,
        errorPreview: a.last_sync_error?.slice(0, 200) ?? null,
      },
    }));
}

/**
 * Emit a "stale sync" candidate when the account is healthy but hasn't
 * successfully synced within the threshold. This is the quiet-failure case
 * where a sync isn't visibly broken but also isn't progressing.
 */
export function staleSyncHeuristic(
  snapshot: TenantSnapshot
): RecommendationCandidate[] {
  const now = Date.now();
  return snapshot.accounts
    .filter(isActive)
    .filter((a) => a.health === "healthy")
    .filter((a) => {
      const lastOk = parseIso(a.last_successful_sync_at);
      if (lastOk !== null) {
        return now - lastOk > STALE_SYNC_THRESHOLD_MS;
      }
      const connected = parseIso(a.connected_at);
      if (connected !== null) {
        return now - connected > STALE_SYNC_THRESHOLD_MS;
      }
      return false;
    })
    .map((a) => ({
      kind: "maintenance",
      signal: "stale_sync",
      title: `${prettyAccountLabel(a)} hasn't synced recently`,
      summary: `No successful sync in the last 48 hours for ${prettyAccountLabel(a)}.`,
      rationale:
        "The connection looks healthy but data hasn't refreshed recently. Trigger a manual resync or check provider status.",
      confidence: 0.6,
      module: "connections",
      relatedType: "connected_account",
      relatedId: a.id,
      suggestedAction: { type: "navigate", to: "/integrations" },
      context: {
        signal: "stale_sync",
        platform: a.platform,
        lastSuccessfulSyncAt: a.last_successful_sync_at,
        connectedAt: a.connected_at,
      },
    }));
}

/**
 * Onboarding nudge: emit exactly one `insight` rec when the business
 * profile has zero active connections. Keyed to the business_profile itself
 * so re-running the producer doesn't duplicate and so the rec auto-expires
 * when the user connects their first account.
 */
export function noIntegrationsHeuristic(
  snapshot: TenantSnapshot
): RecommendationCandidate[] {
  const activeCount = snapshot.accounts.filter(isActive).length;
  if (activeCount > 0) return [];
  return [
    {
      kind: "insight",
      signal: "no_integrations",
      title: "Connect your first integration",
      summary:
        "This business profile has no active connections yet. Linking an account unlocks analytics, messaging, and publishing.",
      rationale:
        "Most of the app (content, reviews, messages, analytics) needs at least one connected account to do anything useful.",
      confidence: 0.9,
      module: "connections",
      relatedType: "business_profile",
      relatedId: snapshot.businessProfileId,
      suggestedAction: { type: "navigate", to: "/integrations" },
      context: { signal: "no_integrations" },
    },
  ];
}

/**
 * Emit an `engagement` rec for each unfinished task past its `due_at`.
 * Capped at `OVERDUE_TASKS_CAP` so a backlog explosion doesn't drown the
 * feed — additional items remain visible in the Tasks page itself.
 */
export function overdueTasksHeuristic(
  snapshot: TenantSnapshot
): RecommendationCandidate[] {
  const now = Date.now();
  const overdue = snapshot.tasks
    .filter((t) => t.status && t.status !== "done" && t.status !== "archived")
    .filter((t) => {
      const due = parseIso(t.due_at);
      return due !== null && due < now;
    })
    .slice(0, OVERDUE_TASKS_CAP);

  return overdue.map((t) => ({
    kind: "engagement",
    signal: "overdue_task",
    title: t.title
      ? `Overdue task: ${t.title.slice(0, 120)}`
      : "Overdue task needs attention",
    summary: t.title ?? "A task passed its due date without being completed.",
    rationale:
      "Overdue tasks are a strong signal of follow-through debt. Closing them first usually unblocks the rest of the queue.",
    confidence: 0.7,
    module: "tasks",
    relatedType: "task",
    relatedId: t.id,
    suggestedAction: { type: "navigate", to: "/tasks" },
    context: {
      signal: "overdue_task",
      dueAt: t.due_at,
      priority: t.priority,
      taskModule: t.module,
    },
  }));
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Named registry of heuristics. The producer iterates this list and wraps
 * each call in a try/catch so one bad rule can't abort the whole run.
 * Order doesn't matter for correctness (idempotency is key-based) but
 * we group maintenance signals first for readability in logs.
 */
export const ALL_HEURISTICS: Array<{
  name: string;
  fn: (snapshot: TenantSnapshot) => RecommendationCandidate[];
}> = [
  { name: "reconnect_required", fn: reconnectRequiredHeuristic },
  { name: "sync_failed", fn: syncFailedHeuristic },
  { name: "stale_sync", fn: staleSyncHeuristic },
  { name: "no_integrations", fn: noIntegrationsHeuristic },
  { name: "overdue_tasks", fn: overdueTasksHeuristic },
];

/**
 * Run every heuristic and collect candidates. Each rule is isolated: an
 * exception in one rule is logged and the others still run. The producer
 * uses the returned `errors` array to surface non-fatal failures to
 * callers without failing the whole reconcile.
 */
export function runAllHeuristics(snapshot: TenantSnapshot): {
  candidates: RecommendationCandidate[];
  errors: string[];
} {
  const candidates: RecommendationCandidate[] = [];
  const errors: string[] = [];
  for (const { name, fn } of ALL_HEURISTICS) {
    try {
      const out = fn(snapshot);
      if (Array.isArray(out)) candidates.push(...out);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${name}: ${message}`);
      console.warn(
        `[ai-recommendations] heuristic "${name}" threw:`,
        message
      );
    }
  }
  return { candidates, errors };
}
