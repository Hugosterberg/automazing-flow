import { describe, expect, it } from "vitest";
import { buildMarketingAlert, extractPoorCampaignsForAlert } from "../../server/lib/marketingAlert";

const base = {
  businessName: "Acme",
  currency: "SEK",
  roas: null as number | null,
  adSpend: null as number | null,
  revenue: null as number | null,
  inventory: null,
};

describe("buildMarketingAlert", () => {
  it("does not fire when ROAS is healthy and stock is fine", () => {
    const a = buildMarketingAlert({ ...base, roas: 2.4, adSpend: 1000, revenue: 2400 });
    expect(a.hasAlert).toBe(false);
  });

  it("fires when ROAS is underwater (< 1×)", () => {
    const a = buildMarketingAlert({ ...base, roas: 0.6, adSpend: 2000, revenue: 1200 });
    expect(a.hasAlert).toBe(true);
    expect(a.reasons[0]).toMatch(/ROAS 0,6×/);
  });

  it("fires when portfolio score dropped sharply", () => {
    const a = buildMarketingAlert({
      ...base,
      roas: 1.2,
      adSpend: 1000,
      revenue: 1200,
      portfolioGrade: "C",
      portfolioScore: 62,
      portfolioScoreDelta: -18,
    });
    expect(a.hasAlert).toBe(true);
    expect(a.reasons.some((r) => /sjönk 18 poäng/i.test(r))).toBe(true);
  });

  it("includes poor campaign pause guidance", () => {
    const a = buildMarketingAlert({
      ...base,
      roas: 0.8,
      adSpend: 2000,
      revenue: 1600,
      campaignsPoor: 1,
      portfolioGrade: "D",
      portfolioScore: 40,
      poorCampaigns: [
        {
          name: "Summer Sale",
          grade: "F",
          score: 35,
          spend: 800,
          roas: 0.4,
          topAction: "Pausa eller sänk budget tills ROAS är över 1×",
        },
      ],
    });
    expect(a.hasAlert).toBe(true);
    expect(a.reasons.some((r) => r.includes("Summer Sale"))).toBe(true);
    expect(a.html).toContain("Portföljbetyg");
  });

  it("fires when advertising while out of stock", () => {
    const a = buildMarketingAlert({
      ...base,
      roas: 3,
      inventory: { activeCampaigns: 2, outOfStock: 1, lowStock: 1, threshold: 5, examples: ["Mugg"] },
    });
    expect(a.hasAlert).toBe(true);
    expect(a.reasons[0]).toMatch(/slut i lager/i);
  });
});

describe("extractPoorCampaignsForAlert", () => {
  it("returns high-spend poor campaigns sorted by spend", () => {
    const poor = extractPoorCampaignsForAlert([
      {
        platform: "meta_business",
        campaigns: [
          {
            id: "1",
            name: "Bad",
            spend7d: 600,
            score: { grade: "F", score: 30, verdict: "poor", actions: ["Pausa"] },
          },
          {
            id: "2",
            name: "Tiny",
            spend7d: 20,
            score: { grade: "F", score: 20, verdict: "poor", actions: [] },
          },
        ],
      },
    ]);
    expect(poor).toHaveLength(1);
    expect(poor[0].name).toBe("Bad");
  });
});
