import { describe, expect, it } from "vitest";
import { buildWeeklyResultsSummary } from "@/features/weekly-results/buildWeeklyResultsSummary";

describe("buildWeeklyResultsSummary", () => {
  it("builds Swedish lines from metrics", () => {
    const s = buildWeeklyResultsSummary({
      businessName: "Acme",
      leadsWon: 2,
      leadsNew: 1,
      followUpsDue: 3,
      tasksCompleted: 4,
      successEvents: 5,
      roasCurrent: 2.5,
    });
    expect(s.hasContent).toBe(true);
    expect(s.headline).toContain("Acme");
    expect(s.plainText).toContain("leads vunna");
    expect(s.plainText).toContain("ROAS");
  });

  it("handles quiet week", () => {
    const s = buildWeeklyResultsSummary({
      businessName: "Acme",
      leadsWon: 0,
      leadsNew: 0,
      followUpsDue: 0,
      tasksCompleted: 0,
      successEvents: 0,
    });
    expect(s.hasContent).toBe(false);
    expect(s.plainText).toMatch(/lugn/i);
  });
});
