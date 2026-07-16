/**
 * App-wide date/number/currency formatting.
 *
 * One place instead of per-page helpers, for three reasons:
 *   1. Consistent locale. Formatting follows the active UI language
 *      (sv-SE or en-US — see src/lib/i18n.ts), instead of a mix of
 *      hardcoded locales and browser defaults.
 *   2. Performance. `toLocaleDateString(...)` constructs an
 *      `Intl.DateTimeFormat` on every call — measurable in long lists
 *      (inbox rows, order tables). Formatters here are built once and
 *      cached by locale + options.
 *   3. Smarter output. Dates older than the current year include the year
 *      ("5 jan. 2025"), so history views stay unambiguous across
 *      new-year boundaries.
 *
 * All helpers accept ISO strings or Date objects and return "" for
 * missing/unparseable input so callers can render a fallback with `||`.
 */

/** Active formatting locale. Kept in sync with the UI language by i18n.ts. */
let appLocale = "en-US";

/** Called by i18n.ts on init and on every language change. */
export function setFormatLocale(locale: string): void {
  if (locale === appLocale) return;
  appLocale = locale;
  dtfCache.clear();
  nfCache.clear();
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let formatter = dtfCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(appLocale, options);
    dtfCache.set(key, formatter);
  }
  return formatter;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = nfCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(appLocale, options);
    nfCache.set(key, formatter);
  }
  return formatter;
}

/** "Igår"/"Yesterday" per active locale (kept as the app's established forms). */
function yesterdayLabel(): string {
  return appLocale.startsWith("sv") ? "Igår" : "Yesterday";
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local-midnight day difference (not a raw 24h window), so a message sent
 *  23:30 yesterday still reads "Igår" at 00:30 today. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Compact timestamp for list rows: today → "14:05", yesterday → "Igår",
 * within a week → "mån", same year → "5 jan.", older → "5 jan. 2025".
 */
export function formatSmartDate(value: string | Date | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "";
  const diffDays = daysBetween(date, now);
  if (diffDays === 0) return dtf({ hour: "2-digit", minute: "2-digit" }).format(date);
  if (diffDays === 1) return yesterdayLabel();
  if (diffDays > 1 && diffDays < 7) return dtf({ weekday: "short" }).format(date);
  return formatShortDate(date, now);
}

/** "5 jan." within the current year, "5 jan. 2025" otherwise. */
export function formatShortDate(value: string | Date | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "";
  return date.getFullYear() === now.getFullYear()
    ? dtf({ day: "numeric", month: "short" }).format(date)
    : dtf({ day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** Verbose timestamp for detail panes: "ons 5 feb. 2026 14:05". */
export function formatFullDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return dtf({
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Compact date + time: "2026-02-05 14:05" (sv-SE short styles). */
export function formatDateTimeShort(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return dtf({ dateStyle: "short", timeStyle: "short" }).format(date);
}

/** Readable date + time: "5 feb. 2026 14:05" (sv-SE medium/short styles). */
export function formatDateTimeMedium(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return dtf({ dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Time of day only: "14:05". */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return dtf({ hour: "2-digit", minute: "2-digit" }).format(date);
}

/**
 * Escape hatch for bespoke date formats not covered above — still sv-SE
 * and still cached per options shape, so it stays cheap in list rows.
 */
export function formatDateCustom(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  const date = toDate(value);
  if (!date) return "";
  return dtf(options).format(date);
}

/** Grouped integer/decimal in Swedish notation: 12345 → "12 345". */
export function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (value == null || !Number.isFinite(value)) return "";
  return nf(options).format(value);
}

/**
 * Currency amount. Whole units by default (dashboards); pass
 * `{ detailed: true }` to keep öre/cents (order rows, receipts).
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
  opts?: { detailed?: boolean }
): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const code = currency && currency.trim() ? currency : "USD";
  try {
    return nf({
      style: "currency",
      currency: code,
      ...(opts?.detailed ? {} : { maximumFractionDigits: 0 }),
    }).format(amount);
  } catch {
    // Unknown/invalid currency code from an external API — degrade to a
    // plain grouped number with the raw code appended.
    return `${nf(opts?.detailed ? {} : { maximumFractionDigits: 0 }).format(amount)} ${code}`;
  }
}
