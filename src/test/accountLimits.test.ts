import { describe, expect, it } from "vitest";
import {
  applyAccountLimit,
  dedupeAccountsByProfilePlatform,
} from "@/features/connections/accountLimits";
import type { ConnectedAccount } from "@/types/accounts";

function account(overrides: Partial<ConnectedAccount> & { id: string }): ConnectedAccount {
  return {
    profileId: "p1",
    platform: "gmail",
    username: "user@example.com",
    connectedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ConnectedAccount;
}

describe("dedupeAccountsByProfilePlatform", () => {
  it("keeps only the newest account per (profile, platform)", () => {
    const result = dedupeAccountsByProfilePlatform([
      account({ id: "old", connectedAt: "2026-01-01T00:00:00.000Z" }),
      account({ id: "new", connectedAt: "2026-06-01T00:00:00.000Z" }),
      account({ id: "older", connectedAt: "2025-12-01T00:00:00.000Z" }),
    ]);
    expect(result.map((a) => a.id)).toEqual(["new"]);
  });

  it("treats different profiles and platforms as separate slots", () => {
    const result = dedupeAccountsByProfilePlatform([
      account({ id: "a", profileId: "p1", platform: "gmail" }),
      account({ id: "b", profileId: "p2", platform: "gmail" }),
      account({ id: "c", profileId: "p1", platform: "instagram" }),
    ]);
    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores disconnected accounts when picking the survivor but keeps them in the list", () => {
    const result = dedupeAccountsByProfilePlatform([
      account({ id: "gone", connectedAt: "2026-06-01T00:00:00.000Z", disconnectedAt: "2026-06-02T00:00:00.000Z" }),
      account({ id: "live", connectedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(result.map((a) => a.id)).toEqual(["gone", "live"]);
  });
});

describe("applyAccountLimit", () => {
  it("replaces the existing account on the same (profile, platform)", () => {
    const next = applyAccountLimit(
      [account({ id: "old-gmail" }), account({ id: "ig", platform: "instagram" })],
      account({ id: "new-gmail", username: "other@example.com" })
    );
    expect(next.map((a) => a.id)).toEqual(["ig", "new-gmail"]);
  });

  it("does not touch accounts on other profiles", () => {
    const next = applyAccountLimit(
      [account({ id: "p2-gmail", profileId: "p2" })],
      account({ id: "p1-gmail", profileId: "p1" })
    );
    expect(next.map((a) => a.id)).toEqual(["p2-gmail", "p1-gmail"]);
  });

  it("is idempotent for the same account id", () => {
    const first = applyAccountLimit([], account({ id: "x" }));
    const second = applyAccountLimit(first, account({ id: "x" }));
    expect(second.map((a) => a.id)).toEqual(["x"]);
  });
});
