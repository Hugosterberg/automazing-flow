import type { TaskRow } from "./tasksService";

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
