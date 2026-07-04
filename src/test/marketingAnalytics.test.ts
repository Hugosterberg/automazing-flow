import { describe, expect, it } from "vitest";
import {
  computeCampaignScore,
  computeMarketingAnalytics,
  deriveCampaignMetrics,
  gradeLabel,
  scoreRoasComponent,
  scoreToGrade,
} from "../../server/lib/marketingAnalytics";
import { computeMarketingPerformance } from "../../server/lib/marketingPerformance";

describe("deriveCampaignMetrics", () => {
  it("computes CTR, CPC, CPM and ROAS from Meta/Google fields", () => {
    const m = deriveCampaignMetrics({
      id: "1",
      name: "Test",
      status: "ACTIVE",
      spend7d: 1000,
      impressions7d: 50000,
      clicks7d: 800,
      conversionValue7d: 3200,
    });
    expect(m.ctr).toBeCloseTo(800 / 50000);
    expect(m.cpc).toBeCloseTo(1000 / 800);
    expect(m.cpm).toBeCloseTo((1000 / 50000) * 1000);
    expect(m.roas).toBeCloseTo(3.2);
  });
});

describe("scoreRoasComponent", () => {
  it("treats breakeven ROAS as ~70 and underwater as poor", () => {
    expect(scoreRoasComponent(1, true)).toBe(70);
    expect(scoreRoasComponent(2.5, true)).toBeGreaterThan(80);
    expect(scoreRoasComponent(0.5, true)).toBeLessThan(40);
    expect(scoreRoasComponent(null, true)).toBe(35);
  });
});

describe("computeCampaignScore", () => {
  it("grades a profitable Meta campaign highly", () => {
    const { score } = computeCampaignScore(
      {
        id: "1",
        name: "Sales",
        status: "ACTIVE",
        spend7d: 500,
        impressions7d: 30000,
        clicks7d: 450,
        conversionValue7d: 1500,
        roas7d: 3,
      },
      "meta_business",
    );
    expect(score.grade).toMatch(/A|B/);
    expect(score.verdict).toBe("good");
    expect(score.reasons.some((r) => r.includes("ROAS"))).toBe(true);
  });

  it("flags underwater high-spend campaigns", () => {
    const { score } = computeCampaignScore(
      {
        id: "2",
        name: "Loss",
        status: "ACTIVE",
        spend7d: 800,
        impressions7d: 20000,
        clicks7d: 100,
        conversionValue7d: 300,
        roas7d: 0.375,
      },
      "google_ads",
    );
    expect(["D", "F"]).toContain(score.grade);
    expect(score.verdict).toBe("poor");
  });

  it("returns unknown grade when there is no spend", () => {
    const { score } = computeCampaignScore(
      { id: "3", name: "Idle", status: "ACTIVE" },
      "meta_business",
    );
    expect(score.grade).toBe("—");
    expect(score.verdict).toBe("unknown");
  });
});

describe("computeMarketingAnalytics", () => {
  it("builds portfolio score blending campaigns and Shopify ROAS", () => {
    const platforms = [
      {
        platform: "meta_business" as const,
        accountName: "Meta",
        currency: "SEK",
        campaigns: [
          {
            id: "1",
            name: "A",
            status: "ACTIVE",
            spend7d: 1000,
            impressions7d: 40000,
            clicks7d: 600,
            conversionValue7d: 2500,
            roas7d: 2.5,
          },
          {
            id: "2",
            name: "B",
            status: "ACTIVE",
            spend7d: 500,
            impressions7d: 10000,
            clicks7d: 50,
            conversionValue7d: 200,
            roas7d: 0.4,
          },
        ],
      },
    ];
    const performance = computeMarketingPerformance({
      windowDays: 7,
      adSpendByPlatform: { meta_business: 1500 },
      adSpendCurrency: "SEK",
      revenue: 6000,
      orders: 40,
      revenueCurrency: "SEK",
    });
    const analytics = computeMarketingAnalytics(platforms, performance);
    expect(analytics).not.toBeNull();
    expect(analytics!.portfolioScore).toBeGreaterThan(0);
    expect(analytics!.portfolioGrade).not.toBe("—");
    expect(analytics!.blendedCtr).toBeCloseTo(650 / 50000);
    expect(analytics!.campaignsScored).toBe(2);
    expect(analytics!.platformScores.meta_business?.campaignCount).toBe(2);
  });
});

describe("grade helpers", () => {
  it("maps score buckets to Swedish labels", () => {
    expect(scoreToGrade(92)).toBe("A");
    expect(gradeLabel("A")).toBe("Utmärkt");
    expect(gradeLabel("F")).toBe("Förlustbringande");
  });
});
