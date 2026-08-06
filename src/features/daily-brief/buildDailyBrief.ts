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
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";

export type BriefItemKind =
  | "connection"
  | "message"
  | "marketing"
  | "lead"
  | "task"
  | "recommendation"
  | "review"
  | "automation"
  | "agent"
  | "economy"
  | "store";
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
  /**
   * Actionable triage count (Idag + Denna vecka). When set, preferred over raw
   * unreadDms so FYI/Brus do not inflate the brief badge.
   */
  triageAttentionCount?: number;
  /** Blended marketing ROAS (revenue ÷ ad spend) when it has dropped below 1×. */
  underwaterRoas?: number | null;
  /** ROAS week-over-week trend from nightly marketing snapshots. */
  marketingTrendDown?: boolean;
  /** Reviews awaiting a reply (synced from Reviews page). */
  reviewsNeedingReply?: number;
  /** Low-stock or out-of-stock variants while ads are running. */
  inventoryAlertCount?: number;
  /** Cached Shopify ops from a prior Ecommerce visit this session. */
  shopifyOps?: {
    staleUnfulfilled: number;
    pendingPayments: number;
    abandonedCheckouts: number;
  } | null;
  /** Cached Meta ad-comment count from a prior Marketing Paid visit. */
  metaAdCommentCount?: number;
  /** Open leads whose follow-up is overdue or due today. */
  leadsToFollowUp?: number;
  /** Automated outreach drafts waiting for review in Sales. */
  outreachQueuePending?: number;
  /** DM auto-reply drafts waiting for human send (draft-before-send). */
  pendingDmDrafts?: number;
  /** Scheduled automations whose most recent run failed. `title` is display-ready. */
  failedAutomations?: Array<{ title: string }>;
  overdueTasks: Array<{ title: string }>;
  dueTodayTasks: Array<{ title: string }>;
  newRecommendations: Array<{ title: string }>;
  /** Recent CMA / agent runs surfaced via activity_events (module=agent). */
  agentUpdates?: Array<{ title: string }>;
  /** Overdue customer invoices from Fortnox — money waiting to be chased. */
  overdueInvoices?: { count: number; sumLabel: string } | null;
  /** Skatteverket/Bolagsverket deadlines ≤7 days away (pre-filtered, display-ready). */
  taxDeadlinesSoon?: Array<{ title: string; dateLabel: string }>;
}

const SEVERITY_RANK: Record<BriefSeverity, number> = { critical: 0, warning: 1, info: 2 };
const HARD_HEALTH = new Set(["expired", "failed", "missing"]);

/** "A" · "A and B" · "A, B and 2 more" — keeps descriptions readable. */
export function joinNames(names: string[], maxShown = 2): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length <= maxShown) {
    return `${clean.slice(0, -1).join(", ")} ${t("dailyBrief:joinAnd")} ${clean[clean.length - 1]}`;
  }
  return `${clean.slice(0, maxShown).join(", ")} ${t("dailyBrief:joinAndMore", { count: clean.length - maxShown })}`;
}

function taskDescription(tasks: Array<{ title: string }>): string {
  const titles = tasks.map((item) => item.title.trim()).filter(Boolean);
  if (titles.length === 0) return "";
  if (titles.length === 1) return t("dailyBrief:taskOne", { title: titles[0] });
  return t("dailyBrief:taskMore", { title: titles[0], count: titles.length - 1 });
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
      title: t("dailyBrief:signals.connections", { count: n }),
      description: critical
        ? t("dailyBrief:signals.connectionsCritical", { names: labels })
        : t("dailyBrief:signals.connectionsWarn", { names: labels }),
      to: "/connections?tab=health",
      count: n,
    });
  }

  const unreadDms = Math.max(0, Math.trunc(input.unreadDms ?? 0));
  const triageAttention = Math.max(0, Math.trunc(input.triageAttentionCount ?? 0));
  const messageSignal = triageAttention > 0 ? triageAttention : unreadDms;
  const usingTriage = triageAttention > 0;
  if (messageSignal > 0) {
    items.push({
      id: "messages",
      kind: "message",
      severity: "warning",
      title: usingTriage
        ? t("dailyBrief:signals.messagesTriage", { count: messageSignal })
        : t("dailyBrief:signals.messagesUnread", { count: messageSignal }),
      description: usingTriage
        ? t("dailyBrief:signals.messagesTriageDesc")
        : messageSignal === 1
          ? t("dailyBrief:signals.messagesUnreadOneDesc")
          : t("dailyBrief:signals.messagesUnreadManyDesc"),
      to: "/messages?bucket=today",
      count: messageSignal,
    });
  }

  const leadsToFollowUp = Math.max(0, Math.trunc(input.leadsToFollowUp ?? 0));
  if (leadsToFollowUp > 0) {
    items.push({
      id: "leads-followup",
      kind: "lead",
      severity: "warning",
      title: t("dailyBrief:signals.leads", { count: leadsToFollowUp }),
      description:
        leadsToFollowUp === 1
          ? t("dailyBrief:signals.leadsDescOne")
          : t("dailyBrief:signals.leadsDescMany"),
      to: "/sales?view=followups",
      count: leadsToFollowUp,
    });
  }

  const outreachQueuePending = Math.max(0, Math.trunc(input.outreachQueuePending ?? 0));
  if (outreachQueuePending > 0) {
    items.push({
      id: "outreach-queue",
      kind: "lead",
      severity: "info",
      title: t("dailyBrief:signals.outreach", { count: outreachQueuePending }),
      description: t("dailyBrief:signals.outreachDesc"),
      to: "/sales?view=outreach-queue",
      count: outreachQueuePending,
    });
  }

  const pendingDmDrafts = Math.max(0, Math.trunc(input.pendingDmDrafts ?? 0));
  if (pendingDmDrafts > 0) {
    items.push({
      id: "dm-drafts",
      kind: "message",
      severity: "warning",
      title: t("dailyBrief:signals.dmDrafts", { count: pendingDmDrafts }),
      description: t("dailyBrief:signals.dmDraftsDesc"),
      to: "/messages?tab=instagram",
      count: pendingDmDrafts,
    });
  }

  const underwaterRoas = input.underwaterRoas;
  if (underwaterRoas != null && Number.isFinite(underwaterRoas) && underwaterRoas < 1) {
    items.push({
      id: "marketing-roas",
      kind: "marketing",
      severity: "warning",
      title: t("dailyBrief:signals.roasUnderwater", {
        roas: formatNumber(underwaterRoas, { maximumFractionDigits: 1 }),
      }),
      description: t("dailyBrief:signals.roasUnderwaterDesc"),
      to: "/marketing",
      count: 1,
    });
  } else if (input.marketingTrendDown) {
    items.push({
      id: "marketing-trend",
      kind: "marketing",
      severity: "info",
      title: t("dailyBrief:signals.roasDown"),
      description: t("dailyBrief:signals.roasDownDesc"),
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
      title: t("dailyBrief:signals.inventory", { count: inventoryAlertCount }),
      description: t("dailyBrief:signals.inventoryDesc"),
      to: "/ecommerce?tab=products",
      count: inventoryAlertCount,
    });
  }

  const shopifyOps = input.shopifyOps;
  const staleUnfulfilled = Math.max(0, Math.trunc(shopifyOps?.staleUnfulfilled ?? 0));
  if (staleUnfulfilled > 0) {
    items.push({
      id: "shopify-stale-unfulfilled",
      kind: "store",
      severity: "critical",
      title: t("dailyBrief:signals.staleUnfulfilled", { count: staleUnfulfilled }),
      description: t("dailyBrief:signals.staleUnfulfilledDesc"),
      to: "/ecommerce?tab=orders",
      count: staleUnfulfilled,
    });
  }
  const pendingPayments = Math.max(0, Math.trunc(shopifyOps?.pendingPayments ?? 0));
  if (pendingPayments > 0) {
    items.push({
      id: "shopify-pending-payments",
      kind: "store",
      severity: "warning",
      title: t("dailyBrief:signals.pendingPayments", { count: pendingPayments }),
      description: t("dailyBrief:signals.pendingPaymentsDesc"),
      to: "/ecommerce?tab=orders",
      count: pendingPayments,
    });
  }
  const abandonedCheckouts = Math.max(0, Math.trunc(shopifyOps?.abandonedCheckouts ?? 0));
  if (abandonedCheckouts > 0) {
    items.push({
      id: "shopify-abandoned",
      kind: "store",
      severity: "info",
      title: t("dailyBrief:signals.abandonedCarts", { count: abandonedCheckouts }),
      description: t("dailyBrief:signals.abandonedCartsDesc"),
      to: "/ecommerce?tab=orders",
      count: abandonedCheckouts,
    });
  }

  const metaAdCommentCount = Math.max(0, Math.trunc(input.metaAdCommentCount ?? 0));
  if (metaAdCommentCount > 0) {
    items.push({
      id: "meta-ad-comments",
      kind: "marketing",
      severity: "info",
      title: t("dailyBrief:signals.adComments", { count: metaAdCommentCount }),
      description: t("dailyBrief:signals.adCommentsDesc"),
      to: "/marketing?tab=ads#ad-comments",
      count: metaAdCommentCount,
    });
  }

  const failedAutomations = input.failedAutomations ?? [];
  if (failedAutomations.length > 0) {
    const n = failedAutomations.length;
    items.push({
      id: "automations-failed",
      kind: "automation",
      severity: "critical",
      title: t("dailyBrief:signals.automations", { count: n }),
      description: t("dailyBrief:signals.automationsDesc", {
        names: joinNames(failedAutomations.map((a) => a.title)),
      }),
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
      title: t("dailyBrief:signals.reviews", { count: reviewsNeedingReply }),
      description: t("dailyBrief:signals.reviewsDesc"),
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
      title: t("dailyBrief:signals.overdueTasks", { count: n }),
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
      title: t("dailyBrief:signals.dueTodayTasks", { count: n }),
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
      title: t("dailyBrief:signals.ai", { count: n }),
      description: taskDescription(input.newRecommendations),
      to: "/ai-recommendations",
      count: n,
    });
  }

  const overdueInvoices = input.overdueInvoices ?? null;
  if (overdueInvoices && overdueInvoices.count > 0) {
    items.push({
      id: "economy-overdue-invoices",
      kind: "economy",
      severity: "warning",
      title: t("dailyBrief:signals.overdueInvoices", { count: overdueInvoices.count }),
      description: t("dailyBrief:signals.overdueInvoicesDesc", { sum: overdueInvoices.sumLabel }),
      to: "/company?tab=economy",
      count: overdueInvoices.count,
    });
  }

  const taxDeadlinesSoon = input.taxDeadlinesSoon ?? [];
  if (taxDeadlinesSoon.length > 0) {
    const first = taxDeadlinesSoon[0];
    items.push({
      id: "economy-tax-deadline",
      kind: "economy",
      severity: "warning",
      title: t("dailyBrief:signals.taxDeadline", { title: first.title, date: first.dateLabel }),
      description:
        taxDeadlinesSoon.length > 1
          ? t("dailyBrief:signals.taxDeadlineMoreDesc", { count: taxDeadlinesSoon.length - 1 })
          : t("dailyBrief:signals.taxDeadlineDesc"),
      to: "/company?tab=economy",
      count: taxDeadlinesSoon.length,
    });
  }

  const agentUpdates = input.agentUpdates ?? [];
  if (agentUpdates.length > 0) {
    const n = agentUpdates.length;
    items.push({
      id: "agent-updates",
      kind: "agent",
      severity: "info",
      title: t("dailyBrief:signals.agents", { count: n }),
      description: taskDescription(agentUpdates),
      to: "/activity?module=agent",
      count: n,
    });
  }

  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);

  const hasUnderwaterRoas =
    underwaterRoas != null && Number.isFinite(underwaterRoas) && underwaterRoas < 1 ? 1 : 0;
  const hasTrendDown = input.marketingTrendDown ? 1 : 0;
  const actionCount =
    input.connectionIssues.length +
    messageSignal +
    leadsToFollowUp +
    outreachQueuePending +
    pendingDmDrafts +
    hasUnderwaterRoas +
    hasTrendDown +
    // One attention item, not one per SKU — a store with dozens of low-stock
    // variants would otherwise dominate the badge count. The signal's own
    // `count` still carries the real number.
    (inventoryAlertCount > 0 ? 1 : 0) +
    (staleUnfulfilled > 0 ? 1 : 0) +
    (pendingPayments > 0 ? 1 : 0) +
    (abandonedCheckouts > 0 ? 1 : 0) +
    (metaAdCommentCount > 0 ? 1 : 0) +
    reviewsNeedingReply +
    failedAutomations.length +
    input.overdueTasks.length +
    input.dueTodayTasks.length +
    input.newRecommendations.length +
    agentUpdates.length +
    (overdueInvoices?.count ?? 0) +
    taxDeadlinesSoon.length;

  if (items.length === 0) {
    return {
      items,
      actionCount: 0,
      allClear: true,
      headline: t("dailyBrief:caughtUp.headline"),
      subline: t("dailyBrief:caughtUp.subline"),
    };
  }

  return {
    items,
    actionCount,
    allClear: false,
    headline: t("dailyBrief:focus.headline", { count: actionCount }),
    subline: t("dailyBrief:focus.subline"),
  };
}
