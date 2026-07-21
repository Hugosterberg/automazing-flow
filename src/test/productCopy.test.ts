import { describe, expect, it } from "vitest";
import { buildFallbackProductCopy, generateProductCopy } from "../../server/ai/productCopy";

describe("buildFallbackProductCopy", () => {
  it("mentions the product type and vendor when available", () => {
    const result = buildFallbackProductCopy({
      title: "Trail Runner Jacket",
      description: "",
      vendor: "Acme Outdoors",
      productType: "Jacket",
      tags: [],
    });
    expect(result.source).toBe("fallback");
    expect(result.description).toContain("Trail Runner Jacket");
    expect(result.description.toLowerCase()).toContain("acme outdoors".toLowerCase());
  });

  it("keeps existing tags and fills in from vendor/type when thin", () => {
    const result = buildFallbackProductCopy({
      title: "Mug",
      description: "",
      vendor: "Acme",
      productType: "Kitchenware",
      tags: ["ceramic"],
    });
    expect(result.tags).toContain("ceramic");
    expect(result.tags.length).toBeGreaterThan(1);
    expect(result.tags.length).toBeLessThanOrEqual(8);
  });

  it("does not add extra tags when there are already enough", () => {
    const result = buildFallbackProductCopy({
      title: "Mug",
      description: "",
      vendor: "Acme",
      productType: "Kitchenware",
      tags: ["ceramic", "microwave-safe", "dishwasher-safe"],
    });
    expect(result.tags).toEqual(["ceramic", "microwave-safe", "dishwasher-safe"]);
  });
});

describe("generateProductCopy", () => {
  it("falls back to the heuristic when no API key is configured", async () => {
    const result = await generateProductCopy(
      { title: "Water Bottle", description: "", vendor: null, productType: "Bottle", tags: [] },
      null
    );
    expect(result.source).toBe("fallback");
    expect(result.description.length).toBeGreaterThan(0);
  });
});
