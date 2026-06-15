import { describe, expect, it } from "vitest";
import { buildMarketingAlert } from "../../server/lib/marketingAlert";

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
    expect(a.reasons).toHaveLength(0);
  });

  it("fires when ROAS is underwater (< 1×)", () => {
    const a = buildMarketingAlert({ ...base, roas: 0.6, adSpend: 2000, revenue: 1200 });
    expect(a.hasAlert).toBe(true);
    expect(a.reasons[0]).toMatch(/ROAS is 0,6×/);
    expect(a.subject).toContain("Acme");
  });

  it("fires when advertising while out of stock", () => {
    const a = buildMarketingAlert({
      ...base,
      roas: 3,
      adSpend: 500,
      revenue: 1500,
      inventory: { activeCampaigns: 2, outOfStock: 1, lowStock: 1, threshold: 5, examples: ["Mugg"] },
    });
    expect(a.hasAlert).toBe(true);
    expect(a.reasons[0]).toMatch(/out of stock/i);
    expect(a.reasons[0]).toContain("Mugg");
  });

  it("combines both reasons and escapes product names in HTML", () => {
    const a = buildMarketingAlert({
      ...base,
      roas: 0.4,
      adSpend: 1000,
      revenue: 400,
      inventory: { activeCampaigns: 1, outOfStock: 1, lowStock: 0, threshold: 5, examples: ["<b>x</b>"] },
    });
    expect(a.reasons).toHaveLength(2);
    expect(a.html).not.toContain("<b>x</b>");
    expect(a.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
