import { describe, expect, it } from "vitest";
import { computeSyncFreshness, formatAgoSv, STALE_AFTER_MS } from "@/features/connections/syncFreshness";
import type { Connection } from "@/types/connection";

const NOW = Date.parse("2026-07-13T12:00:00Z");

function conn(overrides: Partial<Connection>): Connection {
  return {
    id: "c1",
    businessProfileId: "bp1",
    platform: "instagram",
    username: "user",
    connectedAt: "2026-01-01T00:00:00Z",
    isOAuth: true,
    isZernio: false,
    health: "healthy",
    ...overrides,
  };
}

describe("computeSyncFreshness", () => {
  it("returns empty state without connections", () => {
    const f = computeSyncFreshness([], NOW);
    expect(f.total).toBe(0);
    expect(f.latestSyncedAt).toBeNull();
    expect(f.stale).toHaveLength(0);
  });

  it("picks the most recent sync and flags >24h connections as stale", () => {
    const fresh = conn({ id: "a", lastSyncedAt: "2026-07-13T10:00:00Z" });
    const stale = conn({ id: "b", platform: "tiktok", lastSyncedAt: "2026-07-11T09:00:00Z" });
    const never = conn({ id: "c", platform: "youtube" });
    const f = computeSyncFreshness([fresh, stale, never], NOW);
    expect(f.latestSyncedAt).toBe("2026-07-13T10:00:00Z");
    expect(f.stale.map((c) => c.id)).toEqual(["b"]);
    expect(f.neverSynced.map((c) => c.id)).toEqual(["c"]);
    expect(f.total).toBe(3);
  });

  it("treats exactly-24h as not yet stale", () => {
    const edge = conn({ id: "e", lastSyncedAt: new Date(NOW - STALE_AFTER_MS).toISOString() });
    expect(computeSyncFreshness([edge], NOW).stale).toHaveLength(0);
  });

  it("ignores disconnected connections", () => {
    const gone = conn({ id: "g", disconnectedAt: "2026-07-01T00:00:00Z", lastSyncedAt: "2026-07-01T00:00:00Z" });
    const f = computeSyncFreshness([gone], NOW);
    expect(f.total).toBe(0);
    expect(f.latestSyncedAt).toBeNull();
  });
});

describe("formatAgoSv", () => {
  it("formats minutes, hours and days", () => {
    expect(formatAgoSv("2026-07-13T11:59:40Z", NOW)).toBe("just nu");
    expect(formatAgoSv("2026-07-13T11:25:00Z", NOW)).toBe("35 min sedan");
    expect(formatAgoSv("2026-07-13T09:00:00Z", NOW)).toBe("3 h sedan");
    expect(formatAgoSv("2026-07-10T12:00:00Z", NOW)).toBe("3 d sedan");
  });
});
