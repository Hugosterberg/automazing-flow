/**
 * Page keyboard actions — keys match the first letter of the English action name.
 * J/K = next/previous (vim-style list navigation, industry convention).
 */

export const KEYS = {
  next: "j",
  prev: "k",
  search: "/",
  close: "Escape",
  /** Handled (messages) */
  handled: "h",
  /** Reply focus (messages) */
  reply: "r",
  /** Next open (messages) */
  nextOpen: "n",
  /** Queue / Open / All / Handled inbox filters */
  filterQueue: "q",
  filterOpen: "o",
  filterAll: "a",
  filterHandled: "h",
  /** Mark replied (reviews) */
  markReplied: "m",
  /** AI draft (reviews) */
  draft: "d",
  /** Needs reply filter (reviews) */
  filterNeeds: "n",
  /** Error / Warning filters (activity) */
  filterError: "e",
  filterWarning: "w",
  /** Sent (outreach queue) */
  sent: "s",
  /** Outreach draft (lead follow-ups) */
  outreach: "o",
  /** Overdue / Today task filters */
  filterOverdue: "o",
  filterToday: "t",
  /** Edit (tasks, marketing) */
  edit: "e",
  /** Select/toggle (content browse) */
  select: "s",
  /** Open (calendar) */
  open: "o",
  /** Failed automations */
  failed: "f",
} as const;
