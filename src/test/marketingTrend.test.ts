import { describe, expect, it } from "vitest";
import { computeMarketingTrend, type MarketingSnapshot } from "../features/marketing/marketingTrend";

function snap(date: string, roas: number, adSpend: number, revenue: number): MarketingSnapshot {
  return { snapshotDate: date, roas, adSpend, revenue, orders: null, currency: "SEK" };
}

describe("computeMarketingTrend", () => {
  it("returns empty when there's no history", () => {
    const t = computeMarketingTrend([]);
    expect(t.current).toBeNull();
    expect(t.previous).toBeNull();
    expect(t.direction).toBeNull();
  });

  it("returns only current when there's no ~7-day baseline", () => {
    const t = computeMarketingTrend([snap("2026-06-15", 3, 1000, 3000), snap("2026-06-14", 3, 1000, 3000)]);
    expect(t.current?.snapshotDate).toBe("2026-06-15");
    expect(t.previous).toBeNull();
    expect(t.roasDelta).toBeNull();
  });

  it("compares latest to the snapshot closest to 7 days back", () => {
    const t = computeMarketingTrend([
      snap("2026-06-15", 3.4, 1200, 4080),
      snap("2026-06-12", 3.0, 1100, 3300),
      snap("2026-06-08", 3.0, 1000, 3000), // 7 days back → baseline
      snap("2026-06-01", 2.0, 800, 1600),
    ]);
    expect(t.current?.snapshotDate).toBe("2026-06-15");
    expect(t.previous?.snapshotDate).toBe("2026-06-08");
    expect(t.roasDelta).toBeCloseTo(0.4);
    expect(t.direction).toBe("up");
    expect(Math.round(t.spendChangePct!)).toBe(20); // 1000 → 1200
    expect(Math.round(t.revenueChangePct!)).toBe(36); // 3000 → 4080
  });

  it("flags a downward ROAS trend", () => {
    const t = computeMarketingTrend([snap("2026-06-15", 0.8, 2000, 1600), snap("2026-06-08", 2.0, 1000, 2000)]);
    expect(t.direction).toBe("down");
    expect(t.roasDelta).toBeCloseTo(-1.2);
  });
});
