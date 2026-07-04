import { describe, expect, it } from "vitest";
import {
  computeCampaignScore,
  computeMarketingAnalytics,
  deriveCampaignMetrics,
  gradeLabel,
  scoreRoasComponent,
  scoreToGrade,
} from "../../server/lib/marketingAnalytics";
import { detectAdChannel, scoreAgainstBenchmark } from "../../server/lib/marketingBenchmarks";
import { computeMarketingPerformance } from "../../server/lib/marketingPerformance";

describe("deriveCampaignMetrics", () => {
  it("computes CTR, CPC, CPM, CVR and ROAS from Meta/Google fields", () => {
    const m = deriveCampaignMetrics(
      {
        id: "1",
        name: "Test",
        status: "ACTIVE",
        objective: "OUTCOME_SALES",
        spend7d: 1000,
        impressions7d: 50000,
        clicks7d: 800,
        conversions7d: 40,
        conversionValue7d: 3200,
        frequency7d: 2.1,
      },
      "meta_business",
    );
    expect(m.ctr).toBeCloseTo(800 / 50000);
    expect(m.cpc).toBeCloseTo(1000 / 800);
    expect(m.cpm).toBeCloseTo((1000 / 50000) * 1000);
    expect(m.conversionRate).toBeCloseTo(40 / 800);
    expect(m.roas).toBeCloseTo(3.2);
    expect(m.channel).toBe("social");
    expect(m.frequency).toBe(2.1);
  });
});

describe("marketingBenchmarks", () => {
  it("detects Google Search channel from objective", () => {
    expect(detectAdChannel("SEARCH", "google_ads")).toBe("search");
    expect(detectAdChannel("OUTCOME_SALES", "meta_business")).toBe("social");
  });

  it("scores higher values better when higherIsBetter", () => {
    expect(scoreAgainstBenchmark(0.05, 0.04, 0.025, true)).toBeGreaterThan(90);
    expect(scoreAgainstBenchmark(0.001, 0.04, 0.025, true)).toBeLessThan(40);
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
        objective: "OUTCOME_SALES",
        spend7d: 500,
        impressions7d: 30000,
        clicks7d: 450,
        conversions7d: 20,
        conversionValue7d: 1500,
        roas7d: 3,
        frequency7d: 1.8,
      },
      "meta_business",
      750,
    );
    expect(score.grade).toMatch(/A|B/);
    expect(score.verdict).toBe("good");
    expect(score.breakdown.roas).toBeGreaterThan(80);
    expect(score.actions.length).toBeGreaterThan(0);
  });

  it("flags underwater high-spend campaigns with pause action", () => {
    const { score } = computeCampaignScore(
      {
        id: "2",
        name: "Loss",
        status: "ACTIVE",
        objective: "SEARCH",
        spend7d: 800,
        impressions7d: 20000,
        clicks7d: 100,
        conversions7d: 2,
        conversionValue7d: 300,
        roas7d: 0.375,
      },
      "google_ads",
    );
    expect(["D", "F"]).toContain(score.grade);
    expect(score.verdict).toBe("poor");
    expect(score.actions.some((a) => /pausa/i.test(a))).toBe(true);
  });

  it("warns on Meta frequency fatigue", () => {
    const { score } = computeCampaignScore(
      {
        id: "3",
        name: "Fatigue",
        status: "ACTIVE",
        objective: "OUTCOME_SALES",
        spend7d: 400,
        impressions7d: 50000,
        clicks7d: 500,
        conversions7d: 10,
        conversionValue7d: 800,
        roas7d: 2,
        frequency7d: 5.5,
      },
      "meta_business",
    );
    expect(score.breakdown.audience).toBeLessThanOrEqual(55);
    expect(score.actions.some((a) => /creatives/i.test(a))).toBe(true);
  });

  it("returns unknown grade when there is no spend", () => {
    const { score } = computeCampaignScore(
      { id: "4", name: "Idle", status: "ACTIVE" },
      "meta_business",
    );
    expect(score.grade).toBe("—");
    expect(score.verdict).toBe("unknown");
  });
});

describe("computeMarketingAnalytics", () => {
  it("builds portfolio score, CVR and recommendations", () => {
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
            objective: "OUTCOME_SALES",
            spend7d: 1000,
            impressions7d: 40000,
            clicks7d: 600,
            conversions7d: 30,
            conversionValue7d: 2500,
            roas7d: 2.5,
          },
          {
            id: "2",
            name: "B",
            status: "ACTIVE",
            objective: "OUTCOME_SALES",
            spend7d: 500,
            impressions7d: 10000,
            clicks7d: 50,
            conversions7d: 1,
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
    expect(analytics!.blendedConversionRate).toBeCloseTo(31 / 650);
    expect(analytics!.recommendations.length).toBeGreaterThan(0);
    expect(analytics!.campaignsScored).toBe(2);
  });
});

describe("grade helpers", () => {
  it("maps score buckets to Swedish labels", () => {
    expect(scoreToGrade(92)).toBe("A");
    expect(gradeLabel("A")).toBe("Utmärkt");
    expect(gradeLabel("F")).toBe("Förlustbringande");
  });
});
