import { t } from "@/lib/i18n";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export const LEAD_STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

/** Localized lead status label (follows active UI language). */
export function leadStatusLabel(status: LeadStatus): string {
  return t(`leads:status.${status}`);
}

/**
 * Compatibility map that always reads live translations.
 * Prefer `leadStatusLabel()` in new code.
 */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = new Proxy({} as Record<LeadStatus, string>, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== "string") return undefined;
    if ((LEAD_STATUS_ORDER as string[]).includes(prop)) return leadStatusLabel(prop as LeadStatus);
    return undefined;
  },
  ownKeys() {
    return [...LEAD_STATUS_ORDER];
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === "string" && (LEAD_STATUS_ORDER as string[]).includes(prop)) {
      return { configurable: true, enumerable: true, value: leadStatusLabel(prop as LeadStatus) };
    }
    return undefined;
  },
});

/** Open leads are the ones still worth chasing. */
export function isLeadOpen(status: LeadStatus): boolean {
  return status === "new" || status === "contacted" || status === "qualified";
}

export function isFollowUpOverdue(nextFollowUpAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!nextFollowUpAt) return false;
  const t = Date.parse(nextFollowUpAt);
  if (!Number.isFinite(t)) return false;
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  return t < startOfToday.getTime();
}

export function isFollowUpDueToday(nextFollowUpAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!nextFollowUpAt) return false;
  const t = Date.parse(nextFollowUpAt);
  if (!Number.isFinite(t)) return false;
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(nowMs);
  end.setHours(23, 59, 59, 999);
  return t >= start.getTime() && t <= end.getTime();
}

export interface LeadSortable {
  status: LeadStatus;
  nextFollowUpAt: string | null;
  createdAt: string;
}

/** Open leads untouched for this many days (without a planned follow-up) are flagged as stale. */
export const STALE_LEAD_DAYS = 10;

/**
 * Days since the lead was last touched, when it counts as stale: an open lead
 * with no planned follow-up and no activity for STALE_LEAD_DAYS. Returns null
 * for non-stale leads (closed, has a follow-up date, or recently updated) —
 * leads with a follow-up date are already covered by the overdue logic.
 */
export function leadStaleDays(
  lead: { status: LeadStatus; nextFollowUpAt: string | null; updatedAt: string; createdAt: string },
  nowMs: number = Date.now()
): number | null {
  if (!isLeadOpen(lead.status)) return null;
  if (lead.nextFollowUpAt) return null;
  const touched = Date.parse(lead.updatedAt || lead.createdAt);
  if (!Number.isFinite(touched)) return null;
  const days = Math.floor((nowMs - touched) / 86400000);
  return days >= STALE_LEAD_DAYS ? days : null;
}

/** Suggest a follow-up date when the user moves a lead forward in the pipeline. */
export function suggestedFollowUpIsoForStatus(status: LeadStatus, fromMs: number = Date.now()): string | null {
  if (status === "won" || status === "lost") return null;
  const days = status === "new" ? 2 : status === "contacted" ? 3 : status === "qualified" ? 7 : 3;
  const d = new Date(fromMs);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Sort leads so the most action-worthy float up: open leads before closed,
 * then by soonest follow-up (leads with a follow-up date before those without),
 * then newest first.
 */
export function compareLeads(a: LeadSortable, b: LeadSortable): number {
  const openDiff = Number(isLeadOpen(b.status)) - Number(isLeadOpen(a.status));
  if (openDiff !== 0) return openDiff;

  const aT = a.nextFollowUpAt ? Date.parse(a.nextFollowUpAt) : NaN;
  const bT = b.nextFollowUpAt ? Date.parse(b.nextFollowUpAt) : NaN;
  const aHas = Number.isFinite(aT);
  const bHas = Number.isFinite(bT);
  if (aHas && bHas && aT !== bT) return aT - bT;
  if (aHas !== bHas) return aHas ? -1 : 1;

  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
