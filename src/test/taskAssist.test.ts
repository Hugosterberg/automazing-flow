import { describe, expect, it } from "vitest";
import {
  buildTaskAssistPrompt,
  heuristicTaskAssist,
  parseTaskAssist,
} from "../../server/ai/taskAssist.ts";

describe("buildTaskAssistPrompt", () => {
  it("includes task fields and business context", () => {
    const prompt = buildTaskAssistPrompt({
      title: "Book photographer for spring campaign",
      description: "Need product shots before launch",
      priority: "high",
      dueAt: "2026-08-01",
      checklist: ["Set budget"],
      comments: ["Anna suggested Studio Nord"],
      businessName: "Blomstra AB",
      businessDescription: "Flower shop in Malmö",
      location: "Malmö",
    });
    expect(prompt).toContain("Book photographer for spring campaign");
    expect(prompt).toContain("Need product shots before launch");
    expect(prompt).toContain("Set budget");
    expect(prompt).toContain("Anna suggested Studio Nord");
    expect(prompt).toContain("Blomstra AB");
    expect(prompt).toContain("Malmö");
    expect(prompt).toContain("ONLY JSON");
  });

  it("omits empty optional sections", () => {
    const prompt = buildTaskAssistPrompt({ title: "Fix door" });
    expect(prompt).toContain("Title: Fix door");
    expect(prompt).not.toContain("Business:");
    expect(prompt).not.toContain("Existing checklist");
    expect(prompt).not.toContain("Comments so far");
  });
});

describe("parseTaskAssist", () => {
  it("parses a full valid response", () => {
    const result = parseTaskAssist(
      JSON.stringify({
        summary: "Book a photographer before launch.",
        steps: ["Shortlist 3 studios", "Request quotes", "Book the best one"],
        info: ["Studios in Malmö charge 5-15k SEK/day"],
        draft: "Hi! We're looking for a product photographer…",
        questions: ["What is the budget?"],
      })
    );
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(3);
    expect(result!.info).toHaveLength(1);
    expect(result!.draft).toContain("product photographer");
    expect(result!.questions).toEqual(["What is the budget?"]);
  });

  it("returns null for malformed JSON and empty payloads", () => {
    expect(parseTaskAssist("not json")).toBeNull();
    expect(parseTaskAssist("[]")).toBeNull();
    expect(parseTaskAssist("{}")).toBeNull();
    expect(parseTaskAssist(JSON.stringify({ steps: [], info: [] }))).toBeNull();
  });

  it("clips oversized lists and coerces non-string entries", () => {
    const result = parseTaskAssist(
      JSON.stringify({
        summary: "s",
        steps: Array.from({ length: 20 }, (_, i) => `step ${i}`),
        info: [42, "", "  useful  "],
        draft: "   ",
        questions: ["a", "b", "c", "d", "e"],
      })
    );
    expect(result!.steps).toHaveLength(7);
    expect(result!.info).toEqual(["42", "useful"]);
    expect(result!.draft).toBeNull();
    expect(result!.questions).toHaveLength(3);
  });
});

describe("heuristicTaskAssist", () => {
  it("always returns a usable plan", () => {
    const result = heuristicTaskAssist({ title: "Order new signage" });
    expect(result.summary).toContain("Order new signage");
    expect(result.steps.length).toBeGreaterThan(2);
    expect(result.draft).toBeNull();
  });

  it("skips the break-down step when a checklist already exists", () => {
    const withList = heuristicTaskAssist({ title: "T", checklist: ["a", "b"] });
    const without = heuristicTaskAssist({ title: "T" });
    expect(withList.steps.length).toBeLessThan(without.steps.length);
  });
});
