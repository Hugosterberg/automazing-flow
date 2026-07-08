import { getTaskChecklist, type TaskRow } from "./tasksService";

/**
 * Shared predicates for task filtering. Centralising these keeps the sidebar
 * badge, the /tasks board and the home dashboard tiles on exactly the
 * same definition of "open", "overdue" and "due today". If product tweaks
 * the semantics (e.g. extending overdue to include same-day slippage), one
 * edit here propagates everywhere.
 *
 * Time input is parameterised so callers can memoise stably on a single
 * `Date.now()` snapshot within a render pass.
 */

export function isTaskOpen(task: TaskRow): boolean {
  return task.status !== "done" && task.status !== "archived";
}

export function isTaskOverdue(task: TaskRow, nowMs: number = Date.now()): boolean {
  if (!isTaskOpen(task)) return false;
  if (!task.due_at) return false;
  const dueMs = Date.parse(task.due_at);
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}

/**
 * Ordering for active board columns: overdue first (most overdue on top),
 * then upcoming due dates soonest-first, then undated tasks newest-first.
 * Keeps the most urgent work at the top of To-do / In progress without the
 * user having to hunt for red badges.
 */
export function compareTasksByUrgency(a: TaskRow, b: TaskRow, nowMs: number = Date.now()): number {
  const aOverdue = isTaskOverdue(a, nowMs);
  const bOverdue = isTaskOverdue(b, nowMs);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

  const aDue = a.due_at ? Date.parse(a.due_at) : NaN;
  const bDue = b.due_at ? Date.parse(b.due_at) : NaN;
  const aHasDue = Number.isFinite(aDue);
  const bHasDue = Number.isFinite(bDue);
  if (aHasDue && bHasDue && aDue !== bDue) return aDue - bDue;
  if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;

  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

/**
 * Case-insensitive free-text match across the fields a user thinks of as
 * "the task": title, description and checklist items. Empty/whitespace
 * queries match everything.
 */
export function taskMatchesQuery(task: TaskRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    task.title,
    task.description ?? "",
    ...getTaskChecklist(task).map((item) => item.text),
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * True for open tasks whose due date is later today (after `nowMs` but
 * before end of the local calendar day). Overdue tasks are intentionally
 * excluded here so the two categories never overlap.
 */
export function isTaskDueToday(task: TaskRow, nowMs: number = Date.now()): boolean {
  if (!isTaskOpen(task)) return false;
  if (!task.due_at) return false;
  const dueMs = Date.parse(task.due_at);
  if (!Number.isFinite(dueMs)) return false;
  if (dueMs <= nowMs) return false;
  const now = new Date(nowMs);
  const endOfDayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  ).getTime();
  return dueMs <= endOfDayMs;
}
