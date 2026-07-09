import { describe, expect, it } from "vitest";
import {
  defaultMaxProviders,
  inferFeatureFromQuery,
  scorePlatformForQuery,
} from "../../server/lib/aiToolManager.ts";

describe("aiToolManager", () => {
  it("boosts platforms that match the query", () => {
    const exa = scorePlatformForQuery("exa", "research company prospects", 0, 2);
    const lunar = scorePlatformForQuery("lunarcrush", "research company prospects", 1, 2);
    expect(exa.score).toBeGreaterThan(lunar.score);
    expect(exa.reasons.some((r) => r.includes("Query matches"))).toBe(true);
  });

  it("infers lead research from sales-oriented queries", () => {
    expect(inferFeatureFromQuery("find B2B prospects in Stockholm")).toBe("leadResearch");
  });

  it("infers marketing query from ad spend questions", () => {
    expect(inferFeatureFromQuery("what was our Meta ads spend last week")).toBe("marketingQuery");
  });

  it("allows multiple providers for multi-source compare", () => {
    expect(defaultMaxProviders("multiSourceCompare")).toBeGreaterThan(1);
    expect(defaultMaxProviders("leadResearch")).toBe(2);
    expect(defaultMaxProviders("seoOverview")).toBe(1);
  });
});

describe("estimateOpenAiCostUsd", () => {
  it("returns a small positive cost for typical token counts", async () => {
    const { estimateOpenAiCostUsd } = await import("../../server/lib/aiUsageTracker.ts");
    const cost = estimateOpenAiCostUsd("gpt-4o-mini", 1200, 400);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });
});
