import { describe, expect, it } from "vitest";
import {
  MAX_PLAYBOOK_ITEMS,
  buildSalesPlaybookPrompt,
  heuristicSalesPlaybookItems,
  normalizePlaybookMode,
  parseSalesPlaybookItems,
} from "../../server/ai/salesMarketingPlaybook";

describe("sales marketing playbook", () => {
  it("builds prompts for each mode", () => {
    const ctx = { businessName: "Pump", location: "Sweden", notes: "Portable gear" };
    expect(buildSalesPlaybookPrompt(ctx, "pitch-angles")).toMatch(/PITCH ANGLES/);
    expect(buildSalesPlaybookPrompt(ctx, "cold-outreach")).toMatch(/COLD OUTREACH/);
    expect(buildSalesPlaybookPrompt(ctx, "objections")).toMatch(/OBJECTIONS/);
    expect(buildSalesPlaybookPrompt(ctx, "campaigns")).toMatch(/CAMPAIGNS/);
    expect(buildSalesPlaybookPrompt(ctx, "channels")).toMatch(/MARKETING CHANNELS/);
    expect(buildSalesPlaybookPrompt(ctx, "promotions")).toMatch(/PROMOTIONS/);
  });

  it("parses valid items and drops titleless rows", () => {
    const json = JSON.stringify({
      items: [
        {
          title: "ROI angle",
          body: "Save time and money",
          detail: "Use in demos",
          category: "roi",
        },
        { body: "missing title" },
      ],
    });
    const parsed = parseSalesPlaybookItems(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("ROI angle");
  });

  it("returns heuristic items for every mode", () => {
    const ctx = { company: "Pump AB", industry: "outdoor gear" };
    for (const mode of [
      "pitch-angles",
      "cold-outreach",
      "objections",
      "campaigns",
      "channels",
      "promotions",
    ] as const) {
      const items = heuristicSalesPlaybookItems(ctx, mode);
      expect(items.length).toBeGreaterThanOrEqual(10);
      expect(items.length).toBeLessThanOrEqual(MAX_PLAYBOOK_ITEMS);
      expect(items.every((item) => item.title && item.body)).toBe(true);
    }
  });

  it("normalizes unknown modes to pitch-angles", () => {
    expect(normalizePlaybookMode("campaigns")).toBe("campaigns");
    expect(normalizePlaybookMode("nope")).toBe("pitch-angles");
  });
});
