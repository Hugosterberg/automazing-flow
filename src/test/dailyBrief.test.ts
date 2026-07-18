import { beforeAll, describe, expect, it } from "vitest";
import { buildDailyBrief, joinNames } from "../features/daily-brief/buildDailyBrief";
import { initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  initI18n();
  await i18n.changeLanguage("sv");
});

describe("joinNames", () => {
  it("formats lists for human-readable descriptions", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Instagram"])).toBe("Instagram");
    expect(joinNames(["Instagram", "Gmail"])).toBe("Instagram och Gmail");
    expect(joinNames(["Instagram", "Gmail", "X"])).toBe("Instagram, Gmail och 1 till");
    expect(joinNames(["A", "B", "C", "D"])).toBe("A, B och 2 till");
  });
});

describe("buildDailyBrief", () => {
  const empty = { connectionIssues: [], overdueTasks: [], dueTodayTasks: [], newRecommendations: [] };

  it("reports the all-clear state when nothing needs action", () => {
    const brief = buildDailyBrief(empty);
    expect(brief.allClear).toBe(true);
    expect(brief.items).toHaveLength(0);
    expect(brief.actionCount).toBe(0);
    expect(brief.headline).toMatch(/ikapp/i);
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

  it("surfaces unread DMs as a warning with triage deep link", () => {
    const single = buildDailyBrief({ ...empty, unreadDms: 1 });
    expect(single.items[0].kind).toBe("message");
    expect(single.items[0].severity).toBe("warning");
    expect(single.items[0].title).toBe("1 oläst meddelande");
    expect(single.items[0].description).toMatch(/triage/i);
    expect(single.items[0].to).toBe("/messages?bucket=today");

    const many = buildDailyBrief({ ...empty, unreadDms: 5 });
    expect(many.items[0].title).toBe("5 olästa meddelanden");
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
    expect(brief.items[0].title).toBe("3 leads att följa upp");
    expect(brief.items[0].to).toBe("/sales?view=followups");
    expect(brief.actionCount).toBe(3);
    expect(buildDailyBrief({ ...empty, leadsToFollowUp: 0 }).allClear).toBe(true);
  });

  it("surfaces outreach queue drafts as info", () => {
    const brief = buildDailyBrief({ ...empty, outreachQueuePending: 2 });
    expect(brief.allClear).toBe(false);
    expect(brief.items.some((i) => i.id === "outreach-queue")).toBe(true);
    expect(brief.actionCount).toBe(2);
  });

  it("surfaces pending DM auto-reply drafts", () => {
    const brief = buildDailyBrief({ ...empty, pendingDmDrafts: 2 });
    expect(brief.allClear).toBe(false);
    expect(brief.items.some((i) => i.id === "dm-drafts")).toBe(true);
    expect(brief.items.find((i) => i.id === "dm-drafts")?.to).toBe("/messages?tab=instagram");
    expect(brief.actionCount).toBe(2);
  });

  it("prefers triage attention count over raw unread", () => {
    const brief = buildDailyBrief({ ...empty, unreadDms: 20, triageAttentionCount: 3 });
    const messages = brief.items.find((i) => i.id === "messages");
    expect(messages?.count).toBe(3);
    expect(messages?.title).toMatch(/idag\/denna vecka/i);
    expect(brief.actionCount).toBe(3);
  });

  it("surfaces reviews needing reply and inventory alerts", () => {
    const reviews = buildDailyBrief({ ...empty, reviewsNeedingReply: 2 });
    expect(reviews.items[0].kind).toBe("review");
    expect(reviews.items[0].to).toBe("/reviews?filter=needs_reply");

    const stock = buildDailyBrief({ ...empty, inventoryAlertCount: 3 });
    expect(stock.items[0].kind).toBe("marketing");
    expect(stock.items[0].title).toMatch(/lågt lager/i);
  });

  it("nudges when ad ROAS trend is down without being underwater", () => {
    const brief = buildDailyBrief({ ...empty, marketingTrendDown: true, underwaterRoas: 1.2 });
    expect(brief.items[0].kind).toBe("marketing");
    expect(brief.items[0].title).toMatch(/sjönk/i);
  });

  it("warns when marketing ROAS drops below 1× but stays quiet otherwise", () => {
    const underwater = buildDailyBrief({ ...empty, underwaterRoas: 0.7 });
    expect(underwater.items[0].kind).toBe("marketing");
    expect(underwater.items[0].severity).toBe("warning");
    expect(underwater.items[0].title).toMatch(/under vatten/i);
    expect(underwater.actionCount).toBe(1);

    expect(buildDailyBrief({ ...empty, underwaterRoas: 1.5 }).allClear).toBe(true);
    expect(buildDailyBrief({ ...empty, underwaterRoas: null }).allClear).toBe(true);
  });

  it("treats a disconnected-only connection as a warning, not critical", () => {
    const brief = buildDailyBrief({ ...empty, connectionIssues: [{ label: "X", health: "disconnected" }] });
    expect(brief.items[0].severity).toBe("warning");
    expect(brief.items[0].title).toBe("1 koppling behöver uppmärksamhet");
  });

  it("warns about overdue Fortnox invoices and imminent tax deadlines", () => {
    const brief = buildDailyBrief({
      ...empty,
      overdueInvoices: { count: 2, sumLabel: "12 500 kr" },
      taxDeadlinesSoon: [{ title: "Momsdeklaration", dateLabel: "12 augusti" }],
    });
    const invoices = brief.items.find((i) => i.id === "economy-overdue-invoices");
    const tax = brief.items.find((i) => i.id === "economy-tax-deadline");
    expect(invoices).toMatchObject({
      kind: "economy",
      severity: "warning",
      title: "2 fakturor har förfallit",
      to: "/company?tab=economy",
    });
    expect(invoices?.description).toContain("12 500 kr");
    expect(tax).toMatchObject({
      kind: "economy",
      severity: "warning",
      title: "Momsdeklaration senast 12 augusti",
    });
    expect(brief.actionCount).toBe(3);

    expect(
      buildDailyBrief({ ...empty, overdueInvoices: null, taxDeadlinesSoon: [] }).allClear
    ).toBe(true);
  });

  it("pluralises and summarises counts correctly", () => {
    const brief = buildDailyBrief({
      ...empty,
      overdueTasks: [{ title: "A" }, { title: "B" }, { title: "C" }],
    });
    const item = brief.items[0];
    expect(item.title).toBe("3 uppgifter är försenade");
    expect(item.description).toBe("“A” och 2 till");
    expect(item.count).toBe(3);
    expect(item.to).toBe("/tasks?view=overdue");
  });
});
