import { describe, expect, it } from "vitest";
import {
  buildFirstWinSteps,
  firstWinProgress,
  priorityConnectsForKind,
} from "@/features/onboarding/firstWin";
import {
  healthyPlatformSet,
  isConnectionVerified,
  isResyncSuccess,
} from "@/features/connections/connectionVerified";
import type { Connection } from "@/types/connection";
import {
  connectionsSessionHref,
  readPendingConnectSession,
  writePendingConnectSession,
  clearPendingConnectSession,
} from "@/features/connections/connectSessionState";

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
  it("marks mail and channel done only from healthy platforms", () => {
    const steps = buildFirstWinSteps({
      kind: "company",
      healthyPlatforms: ["gmail", "instagram"],
      profileStrong: false,
    });
    expect(steps.find((s) => s.id === "connect_mail")?.done).toBe(true);
    expect(steps.find((s) => s.id === "connect_channel")?.done).toBe(true);
    expect(steps.find((s) => s.id === "fill_company")?.done).toBe(false);
  });

  it("does not mark mail done when only connected (not healthy)", () => {
    const steps = buildFirstWinSteps({
      kind: "company",
      healthyPlatforms: [],
      connectedPlatforms: ["gmail"],
      profileStrong: false,
    });
    expect(steps.find((s) => s.id === "connect_mail")?.done).toBe(false);
    expect(steps.find((s) => s.id === "open_inbox")?.done).toBe(true);
  });

  it("deep-links mail step to guided session", () => {
    const steps = buildFirstWinSteps({
      kind: "company",
      healthyPlatforms: [],
      profileStrong: false,
    });
    expect(steps.find((s) => s.id === "connect_mail")?.to).toContain("session=gmail");
  });

  it("omits company step for personal profiles", () => {
    const steps = buildFirstWinSteps({
      kind: "personal",
      healthyPlatforms: [],
      profileStrong: false,
    });
    expect(steps.some((s) => s.id === "fill_company")).toBe(false);
  });
});

describe("firstWinProgress", () => {
  it("computes percent", () => {
    const steps = buildFirstWinSteps({
      kind: "personal",
      healthyPlatforms: ["gmail"],
      profileStrong: true,
    });
    const p = firstWinProgress(steps);
    expect(p.done).toBeGreaterThan(0);
    expect(p.percent).toBeGreaterThan(0);
    expect(p.percent).toBeLessThanOrEqual(100);
  });
});

describe("connectionVerified", () => {
  function conn(health: Connection["health"]): Connection {
    return {
      id: "1",
      businessProfileId: "bp",
      platform: "gmail",
      username: "u",
      connectedAt: "2026-01-01",
      isOAuth: true,
      isZernio: false,
      health,
    };
  }

  it("treats only healthy as verified", () => {
    expect(isConnectionVerified(conn("healthy"))).toBe(true);
    expect(isConnectionVerified(conn("expired"))).toBe(false);
  });

  it("builds healthy platform set", () => {
    expect([...healthyPlatformSet([conn("healthy"), conn("failed")])]).toEqual(["gmail"]);
  });

  it("accepts healthy resync", () => {
    expect(isResyncSuccess({ health: "healthy", ok: true })).toBe(true);
    expect(isResyncSuccess({ health: "expired", ok: true })).toBe(false);
  });
});

describe("connectSessionState", () => {
  it("builds session href", () => {
    expect(connectionsSessionHref("gmail", { wizard: true })).toBe(
      "/connections?session=gmail&wizard=1"
    );
  });

  it("round-trips pending session in sessionStorage", () => {
    clearPendingConnectSession();
    writePendingConnectSession({
      platform: "gmail",
      step: "verify",
      accountId: "acc-1",
    });
    const pending = readPendingConnectSession();
    expect(pending?.platform).toBe("gmail");
    expect(pending?.step).toBe("verify");
    expect(pending?.accountId).toBe("acc-1");
    clearPendingConnectSession();
    expect(readPendingConnectSession()).toBeNull();
  });
});
