import { describe, expect, it } from "vitest";
import { resolveActivitySubjectLink } from "@/features/activity/resolveActivitySubjectLink";

describe("resolveActivitySubjectLink", () => {
  it("returns null when type or id is missing", () => {
    expect(resolveActivitySubjectLink(null, "x")).toBeNull();
    expect(resolveActivitySubjectLink("task", null)).toBeNull();
    expect(resolveActivitySubjectLink("", "x")).toBeNull();
  });

  it("maps known subject types to deep links", () => {
    expect(resolveActivitySubjectLink("task", "t1")).toEqual({
      to: "/tasks?task=t1",
      label: "Öppna uppgift",
    });
    expect(resolveActivitySubjectLink("lead", "l1")).toEqual({
      to: "/sales?lead=l1",
      label: "Öppna lead",
    });
    expect(resolveActivitySubjectLink("message", "m1")).toEqual({
      to: "/messages?id=m1",
      label: "Öppna meddelande",
    });
    expect(resolveActivitySubjectLink("connected_account", "a1")).toEqual({
      to: "/connections",
      label: "Öppna kopplingar",
    });
    expect(resolveActivitySubjectLink("product", "p1")).toEqual({
      to: "/ecommerce?tab=products",
      label: "Öppna produkt",
    });
  });

  it("normalizes hyphens and aliases", () => {
    expect(resolveActivitySubjectLink("ai-recommendation", "r1")?.to).toBe("/ai-recommendations");
    expect(resolveActivitySubjectLink("marketing_campaign", "c1")?.to).toBe("/marketing");
    expect(resolveActivitySubjectLink("scheduled-post", "s1")?.to).toBe("/social-media");
  });

  it("encodes subject ids in query params", () => {
    expect(resolveActivitySubjectLink("task", "a b/c")?.to).toBe(
      `/tasks?task=${encodeURIComponent("a b/c")}`
    );
  });

  it("returns null for unknown subject types", () => {
    expect(resolveActivitySubjectLink("widget", "w1")).toBeNull();
  });
});
