import { describe, expect, it } from "vitest";
import {
  STALE_LEAD_DAYS,
  compareLeads,
  isFollowUpDueToday,
  isFollowUpOverdue,
  isLeadOpen,
  leadStaleDays,
} from "../features/leads/leadHelpers";
import {
  buildLeadSuggestionPrompt,
  heuristicLeadSuggestions,
  parseLeadSuggestions,
} from "../../server/ai/leadSuggestions";

const NOW = Date.parse("2026-06-15T12:00:00Z");

describe("lead helpers", () => {
  it("classifies open vs closed statuses", () => {
    expect(isLeadOpen("new")).toBe(true);
    expect(isLeadOpen("qualified")).toBe(true);
    expect(isLeadOpen("won")).toBe(false);
    expect(isLeadOpen("lost")).toBe(false);
  });

  it("detects overdue and due-today follow-ups", () => {
    expect(isFollowUpOverdue("2026-06-14T09:00:00Z", NOW)).toBe(true);
    expect(isFollowUpOverdue("2026-06-15T23:00:00Z", NOW)).toBe(false);
    expect(isFollowUpDueToday("2026-06-15T08:00:00Z", NOW)).toBe(true);
    expect(isFollowUpDueToday("2026-06-16T08:00:00Z", NOW)).toBe(false);
    expect(isFollowUpOverdue(null, NOW)).toBe(false);
  });

  it("flags open leads without follow-up as stale after the threshold", () => {
    const base = { nextFollowUpAt: null, createdAt: "2026-05-01T00:00:00Z" };
    // Untouched for 20 days, no follow-up planned → stale with day count.
    expect(leadStaleDays({ ...base, status: "contacted", updatedAt: "2026-05-26T12:00:00Z" }, NOW)).toBe(20);
    // Touched recently → not stale.
    expect(leadStaleDays({ ...base, status: "contacted", updatedAt: "2026-06-14T12:00:00Z" }, NOW)).toBeNull();
    // Exactly at the threshold counts as stale.
    const atThreshold = NOW - STALE_LEAD_DAYS * 86400000;
    expect(
      leadStaleDays({ ...base, status: "new", updatedAt: new Date(atThreshold).toISOString() }, NOW)
    ).toBe(STALE_LEAD_DAYS);
    // Closed leads and leads with a planned follow-up are never stale.
    expect(leadStaleDays({ ...base, status: "won", updatedAt: "2026-05-01T00:00:00Z" }, NOW)).toBeNull();
    expect(
      leadStaleDays(
        { status: "new", nextFollowUpAt: "2026-07-01T00:00:00Z", createdAt: base.createdAt, updatedAt: "2026-05-01T00:00:00Z" },
        NOW
      )
    ).toBeNull();
    // Missing updatedAt falls back to createdAt.
    expect(leadStaleDays({ ...base, status: "new", updatedAt: "" }, NOW)).toBe(45);
  });

  it("sorts open leads with soonest follow-up first, closed last", () => {
    const leads = [
      { status: "won" as const, nextFollowUpAt: null, createdAt: "2026-06-10T00:00:00Z" },
      { status: "new" as const, nextFollowUpAt: "2026-06-20T00:00:00Z", createdAt: "2026-06-01T00:00:00Z" },
      { status: "contacted" as const, nextFollowUpAt: "2026-06-16T00:00:00Z", createdAt: "2026-06-02T00:00:00Z" },
    ];
    const sorted = [...leads].sort(compareLeads);
    expect(sorted[0].nextFollowUpAt).toBe("2026-06-16T00:00:00Z"); // soonest open
    expect(sorted[1].nextFollowUpAt).toBe("2026-06-20T00:00:00Z");
    expect(sorted[2].status).toBe("won"); // closed last
  });
});

describe("lead suggestions", () => {
  it("builds a prompt that forbids inventing specific companies", () => {
    const prompt = buildLeadSuggestionPrompt({ businessName: "Acme", location: "Sweden" }, 5);
    expect(prompt).toMatch(/Acme/);
    expect(prompt).toMatch(/Sweden/);
    expect(prompt).toMatch(/Do NOT invent specific company names/i);
    expect(prompt).toMatch(/"suggestions"/);
  });

  it("parses valid suggestions and skips malformed ones", () => {
    const json = JSON.stringify({
      suggestions: [
        { target: "Local gyms", why: "fit", how: "search maps" },
        { why: "no target — skip" },
        { target: "  " },
      ],
    });
    const parsed = parseLeadSuggestions(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].target).toBe("Local gyms");
  });

  it("returns [] for non-JSON", () => {
    expect(parseLeadSuggestions("not json")).toEqual([]);
  });

  it("falls back to non-empty heuristic suggestions", () => {
    const s = heuristicLeadSuggestions({ industry: "SaaS", location: "Stockholm", company: "Acme" });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.target && x.why && x.how)).toBe(true);
  });

  it("skips heuristic suggestions that overlap the pipeline", () => {
    const s = heuristicLeadSuggestions({
      company: "Acme",
      existingLeadSegments: ["Mid-size local businesses without a dedicated in-house team in Stockholm"],
      location: "Stockholm",
    });
    expect(s.some((x) => x.target.toLowerCase().includes("mid-size local"))).toBe(false);
  });

  it("mentions won customers in heuristic look-alikes", () => {
    const s = heuristicLeadSuggestions({
      company: "Acme Agency",
      sampleCustomers: ["Nordic Gym Group"],
      location: "Sweden",
    });
    expect(s[0]?.target).toMatch(/Nordic Gym Group/i);
  });
});
