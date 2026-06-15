import { describe, expect, it } from "vitest";
import { computeMarketingPerformance } from "../../server/lib/marketingPerformance";

const base = {
  windowDays: 7,
  adSpendByPlatform: {},
  adSpendCurrency: "SEK",
  revenue: null,
  orders: null,
  revenueCurrency: "SEK",
};

describe("computeMarketingPerformance", () => {
  it("computes ROAS, cost/order and AOV by tying ad spend to revenue", () => {
    const p = computeMarketingPerformance({
      ...base,
      adSpendByPlatform: { meta_business: 2100, google_ads: 1100 },
      revenue: 12450,
      orders: 55,
    });
    expect(p.adSpend).toBe(3200);
    expect(p.roas).toBeCloseTo(12450 / 3200); // 3.89×
    expect(p.costPerOrder).toBeCloseTo(3200 / 55);
    expect(p.averageOrderValue).toBeCloseTo(12450 / 55);
    expect(p.currencyMismatch).toBe(false);
  });

  it("leaves ROAS null when an input is missing (no fake zeros)", () => {
    expect(computeMarketingPerformance({ ...base, adSpendByPlatform: { meta_business: 500 } }).roas).toBeNull();
    expect(computeMarketingPerformance({ ...base, revenue: 1000 }).roas).toBeNull();
    expect(computeMarketingPerformance({ ...base, revenue: 1000, adSpendByPlatform: {} }).adSpend).toBeNull();
  });

  it("only counts platforms that reported spend (unconfigured ≠ 0)", () => {
    const p = computeMarketingPerformance({
      ...base,
      adSpendByPlatform: { meta_business: 800 },
      revenue: 4000,
      orders: 10,
    });
    expect(p.adSpend).toBe(800);
    expect(p.roas).toBeCloseTo(5);
  });

  it("flags a currency mismatch so the UI can caveat the ratio", () => {
    const p = computeMarketingPerformance({
      ...base,
      adSpendByPlatform: { meta_business: 100 },
      adSpendCurrency: "USD",
      revenue: 2000,
      revenueCurrency: "SEK",
      orders: 5,
    });
    expect(p.currencyMismatch).toBe(true);
  });

  it("guards against divide-by-zero orders", () => {
    const p = computeMarketingPerformance({
      ...base,
      adSpendByPlatform: { meta_business: 500 },
      revenue: 1000,
      orders: 0,
    });
    expect(p.costPerOrder).toBeNull();
    expect(p.averageOrderValue).toBeNull();
  });
});
