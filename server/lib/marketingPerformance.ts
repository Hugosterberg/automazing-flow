/**
 * Cross-source marketing performance — ties together ad spend (Meta + Google
 * Ads) and store revenue (Shopify) over the same window into the metrics a
 * business actually cares about: ROAS, cost per order and AOV.
 *
 * Pure and side-effect free. It returns every input alongside the derived
 * numbers so the UI can show *exactly* how each figure was calculated
 * (e.g. "ROAS = revenue ÷ ad spend = 12 450 ÷ 3 200 = 3.9×").
 */

export type AdPlatform = "meta_business" | "google_ads";

export interface MarketingPerformanceInput {
  windowDays: number;
  /** Spend per platform, only for platforms that returned real spend data. */
  adSpendByPlatform: Partial<Record<AdPlatform, number>>;
  adSpendCurrency: string | null;
  revenue: number | null;
  orders: number | null;
  revenueCurrency: string | null;
}

export interface MarketingPerformance extends MarketingPerformanceInput {
  /** Sum of `adSpendByPlatform`, or null when no platform reported spend. */
  adSpend: number | null;
  /** revenue ÷ ad spend (×). */
  roas: number | null;
  /** ad spend ÷ orders (cost per acquired order). */
  costPerOrder: number | null;
  /** revenue ÷ orders. */
  averageOrderValue: number | null;
  /** True when ad spend and revenue are reported in different currencies. */
  currencyMismatch: boolean;
}

function isFinitePositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function computeMarketingPerformance(input: MarketingPerformanceInput): MarketingPerformance {
  const spends = Object.values(input.adSpendByPlatform).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const adSpend = spends.length > 0 ? spends.reduce((a, b) => a + b, 0) : null;

  const roas =
    input.revenue != null && isFinitePositive(adSpend) ? input.revenue / adSpend : null;
  const costPerOrder =
    adSpend != null && isFinitePositive(input.orders) ? adSpend / input.orders : null;
  const averageOrderValue =
    input.revenue != null && isFinitePositive(input.orders) ? input.revenue / input.orders : null;

  const currencyMismatch = Boolean(
    input.adSpendCurrency &&
      input.revenueCurrency &&
      input.adSpendCurrency.toUpperCase() !== input.revenueCurrency.toUpperCase(),
  );

  return { ...input, adSpend, roas, costPerOrder, averageOrderValue, currencyMismatch };
}
