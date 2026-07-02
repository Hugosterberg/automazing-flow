/**
 * Helpers for `<input type="date">` values (`YYYY-MM-DD`) that represent a
 * LOCAL calendar day (task deadlines, lead follow-ups).
 *
 * The bug these prevent: `new Date("2026-07-02")` parses as UTC midnight, so
 * in any timezone east of UTC a deadline picked as "July 2" turned overdue
 * during the morning of July 2, and west of UTC it surfaced a day early.
 * Storing local END of day matches the user's intent ("do this by July 2")
 * and keeps status checks and the displayed date in the same timezone.
 */

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convert a date-input value to an ISO timestamp at the LOCAL end of that
 * day (23:59:59.999). Returns null for empty/malformed input.
 */
export function dateInputToEndOfDayIso(value: string): string | null {
  const trimmed = value.trim();
  if (!DATE_INPUT_RE.test(trimmed)) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(endOfDay.getTime())) return null;
  return endOfDay.toISOString();
}

/**
 * Format a stored timestamp back to the `YYYY-MM-DD` of its LOCAL calendar
 * day, for use as a date-input value. Inverse of `dateInputToEndOfDayIso`.
 */
export function isoToLocalDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
