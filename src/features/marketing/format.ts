/**
 * Marketing-flavoured wrappers around the shared cached formatters in
 * `@/lib/format`. Kept as a separate module because dashboards want
 * "—" placeholders (not empty strings), SEK as the default currency,
 * and adaptive decimals for small ad amounts.
 */
import { formatCurrency, formatNumber as formatNumberBase } from "@/lib/format";

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  // Small amounts (ad CPCs, daily spend) keep öre; larger ones round to
  // whole units so dashboard tiles stay compact.
  return formatCurrency(amount, currency || "SEK", { detailed: Math.abs(amount) < 100 }) || "—";
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatNumberBase(Math.round(n));
}

/** ROAS as "3,9×" (one decimal). */
export function formatRoas(roas: number | null | undefined): string {
  if (roas == null || !Number.isFinite(roas)) return "—";
  return `${formatNumberBase(roas, { maximumFractionDigits: 1 })}×`;
}

/** CTR/CVR as "1,24%" (two decimals). Input is 0–1 fraction. */
export function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${formatNumberBase(rate * 100, { maximumFractionDigits: 2 })}%`;
}
