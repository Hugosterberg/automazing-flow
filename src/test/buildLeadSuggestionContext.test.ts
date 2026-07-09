import { describe, expect, it } from "vitest";
import { getBusinessProfileCompleteness } from "@/features/business-profiles/businessProfileCompleteness";
import { buildLeadSuggestionContext } from "@/features/leads/buildLeadSuggestionContext";

describe("buildLeadSuggestionContext", () => {
  it("combines profile, products and won customers", () => {
    const input = buildLeadSuggestionContext({
      businessProfileId: "bp-1",
      profile: {
        id: "bp-1",
        name: "Acme Studio",
        kind: "company",
        company: "Acme Studio AB",
        website: "https://acme.example",
        location: "Stockholm",
        notes: "We build marketing websites for local businesses.",
        ownerUserId: "u1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      leads: [
        { id: "1", company: "Gym Nordic", status: "won" } as never,
        { id: "2", company: "Open Lead Co", status: "new" } as never,
      ],
      productNames: ["Website package", "SEO retainer"],
    });

    expect(input.businessName).toBe("Acme Studio AB");
    expect(input.website).toBe("https://acme.example");
    expect(input.sampleCustomers).toEqual(["Gym Nordic"]);
    expect(input.existingLeadSegments).toContain("Open Lead Co");
    expect(input.offering).toMatch(/marketing websites/i);
    expect(input.offering).toMatch(/Website package/);
  });

  it("scores profile readiness", () => {
    const ready = getBusinessProfileCompleteness({
      id: "x",
      name: "Test",
      kind: "company",
      company: "Test AB",
      location: "Malmö",
      notes: "Consulting",
      ownerUserId: "u",
      createdAt: "",
    });
    expect(ready.percent).toBeGreaterThanOrEqual(40);
    expect(ready.missing.some((f) => f.id === "company")).toBe(false);
  });
});
