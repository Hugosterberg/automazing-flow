import { describe, expect, it } from "vitest";
import { buildDailyBrief, joinNames } from "../features/daily-brief/buildDailyBrief";

describe("joinNames", () => {
  it("formats lists for human-readable descriptions", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Instagram"])).toBe("Instagram");
    expect(joinNames(["Instagram", "Gmail"])).toBe("Instagram and Gmail");
    expect(joinNames(["Instagram", "Gmail", "X"])).toBe("Instagram, Gmail and 1 more");
    expect(joinNames(["A", "B", "C", "D"])).toBe("A, B and 2 more");
  });
});

describe("buildDailyBrief", () => {
  const empty = { connectionIssues: [], overdueTasks: [], dueTodayTasks: [], newRecommendations: [] };

  it("reports the all-clear state when nothing needs action", () => {
    const brief = buildDailyBrief(empty);
    expect(brief.allClear).toBe(true);
    expect(brief.items).toHaveLength(0);
    expect(brief.actionCount).toBe(0);
    expect(brief.headline).toMatch(/caught up/i);
  });

  it("ranks critical connection failures above warnings and info", () => {
    const brief = buildDailyBrief({
      connectionIssues: [{ label: "Instagram", health: "expired" }],
      unreadDms: 2,
      overdueTasks: [{ title: "Pay invoice" }],
      dueTodayTasks: [{ title: "Call supplier" }],
      newRecommendations: [{ title: "Post a reel" }],
    });
    expect(brief.allClear).toBe(false);
    expect(brief.items[0].kind).toBe("connection");
    expect(brief.items[0].severity).toBe("critical");
    // critical → warnings (overdue tasks + unread DMs) → info (due-today + recs)
    expect(brief.items.map((i) => i.severity)).toEqual([
      "critical",
      "warning",
      "warning",
      "info",
      "info",
    ]);
    expect(brief.actionCount).toBe(6);
  });

  it("surfaces unread DMs as a warning with customer-facing copy", () => {
    const single = buildDailyBrief({ ...empty, unreadDms: 1 });
    expect(single.items[0].kind).toBe("message");
    expect(single.items[0].severity).toBe("warning");
    expect(single.items[0].title).toBe("1 unread message");
    expect(single.items[0].description).toMatch(/waiting for a reply/i);

    const many = buildDailyBrief({ ...empty, unreadDms: 5 });
    expect(many.items[0].title).toBe("5 unread messages");
    expect(many.actionCount).toBe(5);
  });

  it("ignores non-positive or fractional DM counts defensively", () => {
    expect(buildDailyBrief({ ...empty, unreadDms: 0 }).allClear).toBe(true);
    expect(buildDailyBrief({ ...empty, unreadDms: -3 }).allClear).toBe(true);
    expect(buildDailyBrief({ ...empty, unreadDms: 2.9 }).items[0].count).toBe(2);
  });

  it("surfaces leads due for follow-up as a warning", () => {
    const brief = buildDailyBrief({ ...empty, leadsToFollowUp: 3 });
    expect(brief.items[0].kind).toBe("lead");
    expect(brief.items[0].severity).toBe("warning");
    expect(brief.items[0].title).toBe("3 leads to follow up");
    expect(brief.items[0].to).toBe("/sales?view=followups");
    expect(brief.actionCount).toBe(3);
    expect(buildDailyBrief({ ...empty, leadsToFollowUp: 0 }).allClear).toBe(true);
  });

  it("warns when marketing ROAS drops below 1× but stays quiet otherwise", () => {
    const underwater = buildDailyBrief({ ...empty, underwaterRoas: 0.7 });
    expect(underwater.items[0].kind).toBe("marketing");
    expect(underwater.items[0].severity).toBe("warning");
    expect(underwater.items[0].title).toMatch(/underwater/i);
    expect(underwater.actionCount).toBe(1);

    expect(buildDailyBrief({ ...empty, underwaterRoas: 1.5 }).allClear).toBe(true);
    expect(buildDailyBrief({ ...empty, underwaterRoas: null }).allClear).toBe(true);
  });

  it("treats a disconnected-only connection as a warning, not critical", () => {
    const brief = buildDailyBrief({ ...empty, connectionIssues: [{ label: "X", health: "disconnected" }] });
    expect(brief.items[0].severity).toBe("warning");
    expect(brief.items[0].title).toBe("1 connection needs attention");
  });

  it("pluralises and summarises counts correctly", () => {
    const brief = buildDailyBrief({
      ...empty,
      overdueTasks: [{ title: "A" }, { title: "B" }, { title: "C" }],
    });
    const item = brief.items[0];
    expect(item.title).toBe("3 tasks are overdue");
    expect(item.description).toBe("“A” and 2 more");
    expect(item.count).toBe(3);
    expect(item.to).toBe("/tasks?view=overdue");
  });
});
