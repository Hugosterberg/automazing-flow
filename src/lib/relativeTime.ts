/**
 * Native relative time formatting — `"3 minutes ago"`, `"in 2 hours"` etc.
 *
 * Uses `Intl.RelativeTimeFormat` so locale handling is delegated to the
 * browser. Replaces date-fns' `formatDistanceToNow` in UI paths that only
 * need a short "time since / time until" string, avoiding a date-fns
 * dependency in the main bundle.
 *
 * Returns `null` on invalid / empty input so callers can choose between
 * rendering a placeholder or hiding the element.
 */

const UNITS: Array<{ limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { limit: 60_000, divisor: 1_000, unit: "second" },
  { limit: 3_600_000, divisor: 60_000, unit: "minute" },
  { limit: 86_400_000, divisor: 3_600_000, unit: "hour" },
  { limit: 604_800_000, divisor: 86_400_000, unit: "day" },
  { limit: 2_629_800_000, divisor: 604_800_000, unit: "week" },
  { limit: 31_557_600_000, divisor: 2_629_800_000, unit: "month" },
];

let cachedFormatter: Intl.RelativeTimeFormat | null = null;
function getFormatter(): Intl.RelativeTimeFormat {
  if (!cachedFormatter) {
    cachedFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  }
  return cachedFormatter;
}

/**
 * Format an ISO timestamp or Date as a short "time ago" / "time from now"
 * string. Returns `null` when the input is missing or unparseable so the
 * caller can decide how to render the absence.
 */
export function formatRelativeTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;

  const diffMs = ms - Date.now();
  const absMs = Math.abs(diffMs);

  for (const { limit, divisor, unit } of UNITS) {
    if (absMs < limit) {
      const value = Math.round(diffMs / divisor);
      return getFormatter().format(value, unit);
    }
  }
  const years = Math.round(diffMs / 31_557_600_000);
  return getFormatter().format(years, "year");
}
