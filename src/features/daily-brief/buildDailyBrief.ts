/**
 * Smart Daily Brief — turns the day's scattered signals (connection health,
 * task urgency, fresh AI recommendations) into one prioritised, actionable
 * list so the user has a single place to start each day instead of scanning
 * every module.
 *
 * This module is intentionally pure: it takes already-normalised inputs and
 * returns a ranked brief, with no data fetching or React. The component layer
 * feeds it from the existing React Query hooks. New signal sources (unread
 * DMs, pending reviews, …) plug in by adding another block here.
 */

export type BriefItemKind = "connection" | "message" | "marketing" | "lead" | "task" | "recommendation" | "review" | "automation";
export type BriefSeverity = "critical" | "warning" | "info";

export interface BriefItem {
  id: string;
  kind: BriefItemKind;
  severity: BriefSeverity;
  /** Short, scannable headline, e.g. "2 connections need attention". */
  title: string;
  /** One line of supporting detail. */
  description: string;
  /** Deep link into the module that owns the action. */
  to: string;
  /** Underlying count, used for the badge and for ranking ties. */
  count: number;
}

export interface DailyBrief {
  items: BriefItem[];
  /** Total underlying things needing action across every item. */
  actionCount: number;
  allClear: boolean;
  headline: string;
  subline: string;
}

export interface DailyBriefInput {
  /** Connections whose health is not "healthy"/"pending". `label` is display-ready. */
  connectionIssues: Array<{ label: string; health: string }>;
  /** Count of unread inbox DMs/conversations awaiting a reply. */
  unreadDms?: number;
  /** Blended marketing ROAS (revenue ÷ ad spend) when it has dropped below 1×. */
  underwaterRoas?: number | null;
  /** ROAS week-over-week trend from nightly marketing snapshots. */
  marketingTrendDown?: boolean;
  /** Reviews awaiting a reply (synced from Reviews page). */
  reviewsNeedingReply?: number;
  /** Low-stock or out-of-stock variants while ads are running. */
  inventoryAlertCount?: number;
  /** Open leads whose follow-up is overdue or due today. */
  leadsToFollowUp?: number;
  /** Scheduled automations whose most recent run failed. `title` is display-ready. */
  failedAutomations?: Array<{ title: string }>;
  overdueTasks: Array<{ title: string }>;
  dueTodayTasks: Array<{ title: string }>;
  newRecommendations: Array<{ title: string }>;
}

const SEVERITY_RANK: Record<BriefSeverity, number> = { critical: 0, warning: 1, info: 2 };
const HARD_HEALTH = new Set(["expired", "failed", "missing"]);

/** "A" · "A and B" · "A, B and 2 more" — keeps descriptions readable. */
export function joinNames(names: string[], maxShown = 2): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length <= maxShown) {
    return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
  }
  return `${clean.slice(0, maxShown).join(", ")} and ${clean.length - maxShown} more`;
}

function taskDescription(tasks: Array<{ title: string }>): string {
  const titles = tasks.map((t) => t.title.trim()).filter(Boolean);
  if (titles.length === 0) return "";
  const head = `“${titles[0]}”`;
  return titles.length > 1 ? `${head} and ${titles.length - 1} more` : head;
}

export function buildDailyBrief(input: DailyBriefInput): DailyBrief {
  const items: BriefItem[] = [];

  if (input.connectionIssues.length > 0) {
    const n = input.connectionIssues.length;
    const critical = input.connectionIssues.some((c) => HARD_HEALTH.has(String(c.health).toLowerCase()));
    const labels = joinNames(input.connectionIssues.map((c) => c.label));
    items.push({
      id: "connections",
      kind: "connection",
      severity: critical ? "critical" : "warning",
      title: `${n} ${n === 1 ? "connection needs" : "connections need"} attention`,
      description: critical
        ? `${labels} stopped syncing — reconnect to keep data flowing.`
        : `${labels} could use a quick re-sync.`,
      to: "/connections?tab=health",
      count: n,
    });
  }

  const unreadDms = Math.max(0, Math.trunc(input.unreadDms ?? 0));
  if (unreadDms > 0) {
    items.push({
      id: "messages",
      kind: "message",
      severity: "warning",
      title: `${unreadDms} unread ${unreadDms === 1 ? "message" : "messages"}`,
      description:
        unreadDms === 1 ? "A customer is waiting for a reply." : "Customers are waiting for replies.",
      to: "/messages",
      count: unreadDms,
    });
  }

  const leadsToFollowUp = Math.max(0, Math.trunc(input.leadsToFollowUp ?? 0));
  if (leadsToFollowUp > 0) {
    items.push({
      id: "leads-followup",
      kind: "lead",
      severity: "warning",
      title: `${leadsToFollowUp} ${leadsToFollowUp === 1 ? "lead" : "leads"} to follow up`,
      description:
        leadsToFollowUp === 1 ? "A follow-up is due — don't let it go cold." : "Follow-ups are due — keep deals moving.",
      to: "/sales?view=followups",
      count: leadsToFollowUp,
    });
  }

  const underwaterRoas = input.underwaterRoas;
  if (underwaterRoas != null && Number.isFinite(underwaterRoas) && underwaterRoas < 1) {
    items.push({
      id: "marketing-roas",
      kind: "marketing",
      severity: "warning",
      title: `Ads are underwater (ROAS ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(underwaterRoas)}×)`,
      description: "Revenue is below ad spend over the last 7 days — review campaigns on Marketing.",
      to: "/marketing",
      count: 1,
    });
  } else if (input.marketingTrendDown) {
    items.push({
      id: "marketing-trend",
      kind: "marketing",
      severity: "info",
      title: "Ad ROAS dipped this week",
      description: "Week-over-week return on ad spend is down — check what's changed on Marketing.",
      to: "/marketing",
      count: 1,
    });
  }

  const inventoryAlertCount = Math.max(0, Math.trunc(input.inventoryAlertCount ?? 0));
  if (inventoryAlertCount > 0) {
    items.push({
      id: "marketing-inventory",
      kind: "marketing",
      severity: "warning",
      title: `${inventoryAlertCount} ${inventoryAlertCount === 1 ? "product is" : "products are"} low on stock`,
      description: "Active ad campaigns may be pointing at items that need restocking.",
      to: "/marketing",
      count: inventoryAlertCount,
    });
  }

  const failedAutomations = input.failedAutomations ?? [];
  if (failedAutomations.length > 0) {
    const n = failedAutomations.length;
    items.push({
      id: "automations-failed",
      kind: "automation",
      severity: "critical",
      title: `${n} ${n === 1 ? "automation" : "automations"} failed on the last run`,
      description: `${joinNames(failedAutomations.map((a) => a.title))} — review and retry on Automations.`,
      to: "/automations",
      count: n,
    });
  }

  const reviewsNeedingReply = Math.max(0, Math.trunc(input.reviewsNeedingReply ?? 0));
  if (reviewsNeedingReply > 0) {
    items.push({
      id: "reviews-reply",
      kind: "review",
      severity: "warning",
      title: `${reviewsNeedingReply} ${reviewsNeedingReply === 1 ? "review needs" : "reviews need"} a reply`,
      description: "Respond to recent customer feedback while it's still fresh.",
      to: "/reviews?filter=needs_reply",
      count: reviewsNeedingReply,
    });
  }

  if (input.overdueTasks.length > 0) {
    const n = input.overdueTasks.length;
    items.push({
      id: "tasks-overdue",
      kind: "task",
      severity: "warning",
      title: `${n} ${n === 1 ? "task is" : "tasks are"} overdue`,
      description: taskDescription(input.overdueTasks),
      to: "/tasks?view=overdue",
      count: n,
    });
  }

  if (input.dueTodayTasks.length > 0) {
    const n = input.dueTodayTasks.length;
    items.push({
      id: "tasks-due-today",
      kind: "task",
      severity: "info",
      title: `${n} ${n === 1 ? "task is" : "tasks are"} due today`,
      description: taskDescription(input.dueTodayTasks),
      to: "/tasks",
      count: n,
    });
  }

  if (input.newRecommendations.length > 0) {
    const n = input.newRecommendations.length;
    items.push({
      id: "recommendations",
      kind: "recommendation",
      severity: "info",
      title: `${n} new ${n === 1 ? "recommendation" : "recommendations"}`,
      description: taskDescription(input.newRecommendations),
      to: "/ai-recommendations",
      count: n,
    });
  }

  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);

  const hasUnderwaterRoas =
    underwaterRoas != null && Number.isFinite(underwaterRoas) && underwaterRoas < 1 ? 1 : 0;
  const hasTrendDown = input.marketingTrendDown ? 1 : 0;
  const actionCount =
    input.connectionIssues.length +
    unreadDms +
    leadsToFollowUp +
    hasUnderwaterRoas +
    hasTrendDown +
    inventoryAlertCount +
    reviewsNeedingReply +
    failedAutomations.length +
    input.overdueTasks.length +
    input.dueTodayTasks.length +
    input.newRecommendations.length;

  if (items.length === 0) {
    return {
      items,
      actionCount: 0,
      allClear: true,
      headline: "You're all caught up",
      subline: "Nothing needs your attention right now — nice work.",
    };
  }

  return {
    items,
    actionCount,
    allClear: false,
    headline: `${actionCount} ${actionCount === 1 ? "thing needs" : "things need"} your attention`,
    subline: "Here's your focus for today, in priority order.",
  };
}
