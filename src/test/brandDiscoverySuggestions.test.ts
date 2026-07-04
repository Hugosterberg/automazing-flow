import { describe, expect, it } from "vitest";
import {
  MAX_BRAND_DISCOVERY_SUGGESTIONS,
  buildBrandDiscoveryPrompt,
  heuristicBrandDiscoverySuggestions,
  parseBrandDiscoverySuggestions,
} from "../../server/ai/brandDiscoverySuggestions";

describe("brand discovery suggestions", () => {
  it("builds prompts for websites and emails", () => {
    const websites = buildBrandDiscoveryPrompt({ businessName: "Pump", website: "https://pump.example" }, "websites", 20);
    expect(websites).toMatch(/20 specific WEBSITES/);
    expect(websites).toMatch(/Pump/);

    const emails = buildBrandDiscoveryPrompt({ company: "Pump AB", website: "pump.example" }, "emails", 20);
    expect(emails).toMatch(/EMAIL-RELATED/);
  });

  it("parses valid website suggestions", () => {
    const json = JSON.stringify({
      suggestions: [
        {
          value: "https://example.com/reviews",
          kind: "website",
          label: "Reviews",
          reason: "Check reputation",
          category: "reputation",
        },
        { value: "not-a-url", kind: "website", label: "Bad", reason: "Skip", category: "other" },
      ],
    });
    const parsed = parseBrandDiscoverySuggestions(json, "websites");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.value).toBe("https://example.com/reviews");
  });

  it("parses email suggestions", () => {
    const json = JSON.stringify({
      suggestions: [
        {
          value: "hello@pump.example",
          kind: "email",
          label: "Hello",
          reason: "Public inbox",
          category: "own-domain",
        },
      ],
    });
    const parsed = parseBrandDiscoverySuggestions(json, "emails");
    expect(parsed[0]?.kind).toBe("email");
    expect(parsed[0]?.value).toBe("hello@pump.example");
  });

  it("returns up to 20 heuristic website suggestions", () => {
    const items = heuristicBrandDiscoverySuggestions(
      { businessName: "Pump", website: "https://pumpportable.com", location: "Sweden", industry: "outdoor gear" },
      "websites"
    );
    expect(items.length).toBeGreaterThanOrEqual(15);
    expect(items.length).toBeLessThanOrEqual(MAX_BRAND_DISCOVERY_SUGGESTIONS);
    expect(items.every((item) => item.kind === "website")).toBe(true);
  });

  it("returns up to 20 heuristic email suggestions including own domain", () => {
    const items = heuristicBrandDiscoverySuggestions(
      { company: "Pump", website: "pumpportable.com", email: "info@pumpportable.com" },
      "emails"
    );
    expect(items.length).toBeGreaterThanOrEqual(15);
    expect(items.some((item) => item.value === "info@pumpportable.com")).toBe(true);
    expect(items.some((item) => item.value === "hello@pumpportable.com")).toBe(true);
  });
});
