import { describe, expect, it } from "vitest";
import { buildWeeklyReport } from "../../server/lib/weeklyReport";

const base = {
  businessName: "Acme",
  currency: "SEK",
  roasCurrent: null as number | null,
  roasPrevious: null as number | null,
  spendThisWeek: null as number | null,
  revenueThisWeek: null as number | null,
  leadsWon: 0,
  leadsNew: 0,
  followUpsDue: 0,
  tasksCompleted: 0,
};

describe("buildWeeklyReport", () => {
  it("marks a quiet week as no content", () => {
    const r = buildWeeklyReport(base);
    expect(r.hasContent).toBe(false);
    expect(r.subject).toMatch(/quiet week/i);
  });

  it("summarises wins and shows a ROAS trend arrow", () => {
    const r = buildWeeklyReport({
      ...base,
      roasCurrent: 3.4,
      roasPrevious: 3.0,
      spendThisWeek: 1200,
      revenueThisWeek: 4080,
      leadsWon: 2,
      leadsNew: 5,
      tasksCompleted: 7,
      followUpsDue: 3,
    });
    expect(r.hasContent).toBe(true);
    expect(r.subject).toContain("week in review");
    expect(r.html).toMatch(/ROAS 3,4× ▲/);
    expect(r.text).toMatch(/2 leads won/);
    expect(r.text).toMatch(/7 tasks completed/);
  });

  it("escapes the business name in the HTML", () => {
    const r = buildWeeklyReport({ ...base, businessName: "<b>x</b>", leadsWon: 1 });
    expect(r.html).not.toContain("<b>x</b>");
    expect(r.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
