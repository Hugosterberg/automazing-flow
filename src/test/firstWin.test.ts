import { describe, expect, it } from "vitest";
import {
  buildFirstWinSteps,
  firstWinProgress,
  priorityConnectsForKind,
} from "@/features/onboarding/firstWin";

describe("priorityConnectsForKind", () => {
  it("recommends mail+calendar for personal", () => {
    const p = priorityConnectsForKind("personal");
    expect(p.map((x) => x.platform)).toEqual(["gmail", "google_calendar", "instagram"]);
  });

  it("recommends mail+instagram+shopify for company", () => {
    const p = priorityConnectsForKind("company");
    expect(p.map((x) => x.platform)).toEqual(["gmail", "instagram", "shopify"]);
  });
});

describe("buildFirstWinSteps", () => {
  it("marks mail and channel done from connected platforms", () => {
    const steps = buildFirstWinSteps({
      kind: "company",
      connectedPlatforms: ["gmail", "instagram"],
      profileStrong: false,
    });
    expect(steps.find((s) => s.id === "connect_mail")?.done).toBe(true);
    expect(steps.find((s) => s.id === "connect_channel")?.done).toBe(true);
    expect(steps.find((s) => s.id === "fill_company")?.done).toBe(false);
  });

  it("omits company step for personal profiles", () => {
    const steps = buildFirstWinSteps({
      kind: "personal",
      connectedPlatforms: [],
      profileStrong: false,
    });
    expect(steps.some((s) => s.id === "fill_company")).toBe(false);
  });
});

describe("firstWinProgress", () => {
  it("computes percent", () => {
    const steps = buildFirstWinSteps({
      kind: "personal",
      connectedPlatforms: ["gmail"],
      profileStrong: true,
    });
    const p = firstWinProgress(steps);
    expect(p.done).toBeGreaterThan(0);
    expect(p.percent).toBeGreaterThan(0);
    expect(p.percent).toBeLessThanOrEqual(100);
  });
});
