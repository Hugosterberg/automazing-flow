import { describe, expect, it } from "vitest";
import { resolveNavigateTarget } from "../features/ai-recommendations/suggestedAction";

describe("resolveNavigateTarget", () => {
  it("allows newer product routes", () => {
    expect(resolveNavigateTarget({ type: "navigate", to: "/intelligence" })).toBe("/intelligence");
    expect(resolveNavigateTarget({ type: "navigate", to: "/automations" })).toBe("/automations");
    expect(resolveNavigateTarget({ type: "navigate", to: "/digital-brand" })).toBe("/digital-brand");
    expect(resolveNavigateTarget({ type: "navigate", to: "/insights?tab=website" })).toBe(
      "/insights?tab=website"
    );
    expect(resolveNavigateTarget({ type: "navigate", to: "/company" })).toBe("/company");
  });

  it("allows messages triage deep link", () => {
    expect(resolveNavigateTarget({ type: "navigate", to: "/messages?bucket=today" })).toBe(
      "/messages?bucket=today"
    );
  });

  it("rejects external and api paths", () => {
    expect(resolveNavigateTarget({ type: "navigate", to: "//evil.com" })).toBeNull();
    expect(resolveNavigateTarget({ type: "navigate", to: "/api/secret" })).toBeNull();
    expect(resolveNavigateTarget({ type: "external", url: "https://x.com" })).toBeNull();
  });
});
