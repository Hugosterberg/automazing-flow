import { describe, expect, it } from "vitest";
import { getBusinessProfileCompleteness } from "@/features/business-profiles/businessProfileCompleteness";

describe("getBusinessProfileCompleteness", () => {
  it("weights notes heavily", () => {
    const withNotes = getBusinessProfileCompleteness({
      id: "1",
      name: "X",
      kind: "company",
      notes: "We sell consulting to gyms.",
      ownerUserId: "u",
      createdAt: "",
    });
    const withoutNotes = getBusinessProfileCompleteness({
      id: "1",
      name: "X",
      kind: "company",
      company: "X AB",
      location: "Malmö",
      website: "https://x.se",
      email: "a@x.se",
      ownerUserId: "u",
      createdAt: "",
    });
    expect(withNotes.percent).toBeGreaterThan(20);
    expect(withoutNotes.isStrong).toBe(false);
  });

  it("marks profile strong when notes and most fields filled", () => {
    const c = getBusinessProfileCompleteness({
      id: "1",
      name: "Acme",
      kind: "company",
      company: "Acme AB",
      location: "Stockholm",
      website: "https://acme.se",
      email: "hi@acme.se",
      phone: "+46123",
      notes: "Full description of what we do and for whom.",
      ownerUserId: "u",
      createdAt: "",
    });
    expect(c.isStrong).toBe(true);
    expect(c.percent).toBeGreaterThanOrEqual(75);
  });
});
