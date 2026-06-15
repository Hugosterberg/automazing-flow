import { describe, expect, it } from "vitest";
import { buildDigest } from "../../server/lib/digest";

const empty = {
  businessName: "Acme",
  connectionIssues: [],
  overdueTasks: [],
  dueTodayTasks: [],
  newRecommendations: [],
};

describe("buildDigest", () => {
  it("reports an all-clear digest when nothing is outstanding", () => {
    const d = buildDigest(empty);
    expect(d.hasContent).toBe(false);
    expect(d.actionCount).toBe(0);
    expect(d.subject).toMatch(/all caught up/i);
    expect(d.html).toMatch(/nothing new to review/i);
  });

  it("summarises outstanding work across sources", () => {
    const d = buildDigest({
      businessName: "Acme",
      appUrl: "https://app.example.com/",
      connectionIssues: [{ label: "Instagram", health: "expired" }],
      unreadDms: 2,
      leadsToFollowUp: 1,
      overdueTasks: [{ title: "Pay invoice" }],
      dueTodayTasks: [{ title: "Call supplier" }],
      newRecommendations: [{ title: "Post a reel" }],
    });
    expect(d.hasContent).toBe(true);
    expect(d.actionCount).toBe(7);
    expect(d.subject).toContain("7 things need attention");
    expect(d.sections.some((s) => /lead/i.test(s.heading))).toBe(true);
    expect(d.sections.map((s) => s.heading)[0]).toMatch(/connection/i);
    // CTA link points at the app (trailing slash trimmed)
    expect(d.html).toContain('href="https://app.example.com"');
    expect(d.text).toContain("Pay invoice");
  });

  it("escapes HTML in titles to keep the email safe", () => {
    const d = buildDigest({ ...empty, overdueTasks: [{ title: '<script>alert("x")</script>' }] });
    expect(d.html).not.toContain("<script>");
    expect(d.html).toContain("&lt;script&gt;");
  });

  it("ignores non-positive unread DM counts", () => {
    expect(buildDigest({ ...empty, unreadDms: 0 }).hasContent).toBe(false);
    expect(buildDigest({ ...empty, unreadDms: -2 }).hasContent).toBe(false);
  });
});
