import { describe, expect, it } from "vitest";
import {
  buildOutreachDraftPrompt,
  heuristicOutreachDraft,
  normalizeOutreachChannel,
  parseOutreachDraft,
} from "../../server/ai/outreachDraft";
import {
  buildOutreachContentPrompt,
  heuristicOutreachContentIdeas,
  parseOutreachContentIdeas,
} from "../../server/ai/outreachContent";

describe("outreach draft", () => {
  it("builds prompts per channel", () => {
    const ctx = { businessName: "Acme", prospectCompany: "Beta Co" };
    expect(buildOutreachDraftPrompt(ctx, "email")).toMatch(/cold email/i);
    expect(buildOutreachDraftPrompt(ctx, "linkedin")).toMatch(/LinkedIn/i);
    expect(buildOutreachDraftPrompt(ctx, "follow-up")).toMatch(/follow-up/i);
  });

  it("parses valid draft JSON", () => {
    const json = JSON.stringify({
      subject: "Hello",
      body: "Main message",
      followUps: [{ day: 3, body: "Bump" }],
    });
    const draft = parseOutreachDraft(json);
    expect(draft?.subject).toBe("Hello");
    expect(draft?.followUps).toHaveLength(1);
  });

  it("returns heuristic draft with follow-ups", () => {
    const draft = heuristicOutreachDraft({ businessName: "Acme", prospectCompany: "Beta" }, "email");
    expect(draft.body).toContain("Beta");
    expect(draft.followUps.length).toBeGreaterThan(0);
  });

  it("normalizes channels", () => {
    expect(normalizeOutreachChannel("linkedin")).toBe("linkedin");
    expect(normalizeOutreachChannel("followup")).toBe("follow-up");
    expect(normalizeOutreachChannel("")).toBe("email");
  });
});

describe("outreach content ideas", () => {
  it("builds outreach content prompt", () => {
    expect(buildOutreachContentPrompt({ businessName: "Acme", targetAudience: "SMB owners" })).toMatch(
      /ATTRACT and WARM/
    );
  });

  it("parses outreach content ideas", () => {
    const parsed = parseOutreachContentIdeas(
      JSON.stringify({
        ideas: [{ title: "Pain post", hook: "Stop wasting time", format: "Reel", cta: "DM us", audience: "Ops", channel: "LinkedIn" }],
      })
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.audience).toBe("Ops");
  });

  it("returns heuristic outreach content ideas", () => {
    expect(heuristicOutreachContentIdeas({ businessName: "Acme" }).length).toBeGreaterThan(3);
  });
});
