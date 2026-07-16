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

export type BriefItemKind =
  | "connection"
  | "message"
  | "marketing"
  | "lead"
  | "task"
  | "recommendation"
  | "review"
  | "automation"
  | "agent";
export type BriefSeverity = "critical" | "warning" | "info";

export interface BriefItem {
  id: string;
  kind: BriefItemKind;
  severity: BriefSeverity;
  /** Short, scannable headline, e.g. "2 kopplingar behöver uppmärksamhet". */
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
  /** Automated outreach drafts waiting for review in Sales. */
  outreachQueuePending?: number;
  /** Scheduled automations whose most recent run failed. `title` is display-ready. */
  failedAutomations?: Array<{ title: string }>;
  overdueTasks: Array<{ title: string }>;
  dueTodayTasks: Array<{ title: string }>;
  newRecommendations: Array<{ title: string }>;
  /** Recent CMA / agent runs surfaced via activity_events (module=agent). */
  agentUpdates?: Array<{ title: string }>;
}

const SEVERITY_RANK: Record<BriefSeverity, number> = { critical: 0, warning: 1, info: 2 };
const HARD_HEALTH = new Set(["expired", "failed", "missing"]);

/** "A" · "A och B" · "A, B och 2 till" — keeps descriptions readable. */
export function joinNames(names: string[], maxShown = 2): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length <= maxShown) {
    return `${clean.slice(0, -1).join(", ")} och ${clean[clean.length - 1]}`;
  }
  return `${clean.slice(0, maxShown).join(", ")} och ${clean.length - maxShown} till`;
}

function taskDescription(tasks: Array<{ title: string }>): string {
  const titles = tasks.map((t) => t.title.trim()).filter(Boolean);
  if (titles.length === 0) return "";
  const head = `“${titles[0]}”`;
  return titles.length > 1 ? `${head} och ${titles.length - 1} till` : head;
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
      title: n === 1 ? "1 koppling behöver uppmärksamhet" : `${n} kopplingar behöver uppmärksamhet`,
      description: critical
        ? `${labels} synkar inte — återanslut för att behålla flödet.`
        : `${labels} behöver en snabb omsynk.`,
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
      title: unreadDms === 1 ? "1 oläst meddelande" : `${unreadDms} olästa meddelanden`,
      description:
        unreadDms === 1
          ? "Öppna triage-hinken Idag och svara."
          : "Börja med triage-hinken Idag — svara det viktiga först.",
      to: "/messages?bucket=today",
      count: unreadDms,
    });
  }

  const leadsToFollowUp = Math.max(0, Math.trunc(input.leadsToFollowUp ?? 0));
  if (leadsToFollowUp > 0) {
    items.push({
      id: "leads-followup",
      kind: "lead",
      severity: "warning",
      title: leadsToFollowUp === 1 ? "1 lead att följa upp" : `${leadsToFollowUp} leads att följa upp`,
      description:
        leadsToFollowUp === 1
          ? "En uppföljning är due — låt den inte kallna."
          : "Uppföljningar väntar — håll affärerna i rörelse.",
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
      title:
        outreachQueuePending === 1
          ? "1 outreach-utkast redo"
          : `${outreachQueuePending} outreach-utkast redo`,
      description: "Automatisk uppföljningstext väntar — granska och skicka under Sales.",
      to: "/sales?view=outreach-queue",
      count: outreachQueuePending,
    });
  }

  const underwaterRoas = input.underwaterRoas;
  if (underwaterRoas != null && Number.isFinite(underwaterRoas) && underwaterRoas < 1) {
    items.push({
      id: "marketing-roas",
      kind: "marketing",
      severity: "warning",
      title: `Annonser under vatten (ROAS ${formatNumber(underwaterRoas, { maximumFractionDigits: 1 })}×)`,
      description: "Intäkt under annonskostnad senaste 7 dagarna — granska kampanjerna under Marketing.",
      to: "/marketing",
      count: 1,
    });
  } else if (input.marketingTrendDown) {
    items.push({
      id: "marketing-trend",
      kind: "marketing",
      severity: "info",
      title: "Annons-ROAS sjönk den här veckan",
      description: "Vecka-mot-vecka-avkastning är ner — kolla vad som ändrats under Marketing.",
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
      title:
        inventoryAlertCount === 1
          ? "1 produkt har lågt lager"
          : `${inventoryAlertCount} produkter har lågt lager`,
      description: "Aktiva annonser kan peka mot varor som behöver påfyllning.",
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
      title: n === 1 ? "1 automation misslyckades senast" : `${n} automationer misslyckades senast`,
      description: `${joinNames(failedAutomations.map((a) => a.title))} — granska och kör om under Automationer.`,
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
      title: reviewsNeedingReply === 1 ? "1 recension behöver svar" : `${reviewsNeedingReply} recensioner behöver svar`,
      description: "Svara på färsk kundfeedback medan den fortfarande är aktuell.",
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
      title: n === 1 ? "1 uppgift är försenad" : `${n} uppgifter är försenade`,
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
      title: n === 1 ? "1 uppgift förfaller idag" : `${n} uppgifter förfaller idag`,
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
      title: n === 1 ? "1 nytt AI-förslag" : `${n} nya AI-förslag`,
      description: taskDescription(input.newRecommendations),
      to: "/ai-recommendations",
      count: n,
    });
  }

  const agentUpdates = input.agentUpdates ?? [];
  if (agentUpdates.length > 0) {
    const n = agentUpdates.length;
    items.push({
      id: "agent-updates",
      kind: "agent",
      severity: "info",
      title: n === 1 ? "1 agentresultat att granska" : `${n} agentresultat att granska`,
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
    unreadDms +
    leadsToFollowUp +
    outreachQueuePending +
    hasUnderwaterRoas +
    hasTrendDown +
    inventoryAlertCount +
    reviewsNeedingReply +
    failedAutomations.length +
    input.overdueTasks.length +
    input.dueTodayTasks.length +
    input.newRecommendations.length +
    agentUpdates.length;

  if (items.length === 0) {
    return {
      items,
      actionCount: 0,
      allClear: true,
      headline: "Du är ikapp",
      subline: "Inget behöver din uppmärksamhet just nu — bra jobbat.",
    };
  }

  return {
    items,
    actionCount,
    allClear: false,
    headline: actionCount === 1 ? "1 sak behöver din uppmärksamhet" : `${actionCount} saker behöver din uppmärksamhet`,
    subline: "Här är dagens fokus, i prioritetsordning.",
  };
}
