import { describe, expect, it } from "vitest";
import {
  buildContentIdeaPrompt,
  heuristicContentIdeas,
  parseContentIdeas,
} from "../../server/ai/contentIdeas";

describe("content ideas", () => {
  it("builds a prompt with the business context and JSON contract", () => {
    const prompt = buildContentIdeaPrompt({ businessName: "Acme", platform: "Instagram" }, 5);
    expect(prompt).toMatch(/Acme/);
    expect(prompt).toMatch(/Instagram/);
    expect(prompt).toMatch(/"ideas"/);
  });

  it("parses valid ideas and drops titleless ones", () => {
    const json = JSON.stringify({
      ideas: [
        { title: "Behind the scenes", hook: "ever wondered", format: "Reel", cta: "Follow" },
        { hook: "no title" },
      ],
    });
    const parsed = parseContentIdeas(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Behind the scenes");
    expect(parsed[0].format).toBe("Reel");
  });

  it("returns [] for non-JSON", () => {
    expect(parseContentIdeas("nope")).toEqual([]);
  });

  it("always offers non-empty heuristic ideas", () => {
    const ideas = heuristicContentIdeas({ businessName: "Acme" });
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.every((i) => i.title && i.hook && i.format && i.cta)).toBe(true);
  });
});
