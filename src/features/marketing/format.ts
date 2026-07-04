export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: currency || "SEK",
      maximumFractionDigits: Math.abs(amount) < 100 ? 2 : 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency || ""}`.trim();
  }
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("sv-SE").format(Math.round(n));
}

/** ROAS as "3,9×" (one decimal). */
export function formatRoas(roas: number | null | undefined): string {
  if (roas == null || !Number.isFinite(roas)) return "—";
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(roas)}×`;
}

/** CTR/CVR as "1,24%" (two decimals). Input is 0–1 fraction. */
export function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(rate * 100)}%`;
}
