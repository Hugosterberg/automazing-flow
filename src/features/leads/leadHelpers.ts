export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export const LEAD_STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

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
