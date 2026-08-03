import { describe, expect, it } from "vitest";
import { shouldSyncPendingCount } from "@/features/reviews/useReviewReplyState";
import { normalizeJudgemeShopDomain } from "@/features/connections/judgemeConnect";

const NOW = Date.parse("2026-08-03T12:00:00Z");

describe("shouldSyncPendingCount", () => {
  it("writes when the pending count changed", () => {
    expect(
      shouldSyncPendingCount({
        pending: 4,
        storedCount: 3,
        updatedAt: new Date(NOW - 1000).toISOString(),
        now: NOW,
      })
    ).toBe(true);
  });

  it("skips the write when the count is unchanged and freshly synced", () => {
    // Guards the render→save→render loop: the caller's effect re-runs on every
    // render, so an unchanged count must not produce a write.
    expect(
      shouldSyncPendingCount({
        pending: 3,
        storedCount: 3,
        updatedAt: new Date(NOW - 60_000).toISOString(),
        now: NOW,
      })
    ).toBe(false);
  });

  it("refreshes the timestamp once the cached value gets old", () => {
    expect(
      shouldSyncPendingCount({
        pending: 3,
        storedCount: 3,
        updatedAt: new Date(NOW - 11 * 60 * 1000).toISOString(),
        now: NOW,
      })
    ).toBe(true);
  });

  it("writes when there is no usable timestamp yet", () => {
    expect(shouldSyncPendingCount({ pending: 0, storedCount: 0, updatedAt: null, now: NOW })).toBe(true);
    expect(shouldSyncPendingCount({ pending: 0, storedCount: 0, updatedAt: "not-a-date", now: NOW })).toBe(true);
  });
});

describe("normalizeJudgemeShopDomain (client mirror)", () => {
  it("matches the server for Shopify handles and admin URLs", () => {
    expect(normalizeJudgemeShopDomain("my-store")).toBe("my-store.myshopify.com");
    expect(normalizeJudgemeShopDomain("https://MyStore.myshopify.com/admin")).toBe("mystore.myshopify.com");
  });

  it("keeps non-Shopify hosts", () => {
    expect(normalizeJudgemeShopDomain("https://www.example.com/shop")).toBe("example.com");
  });

  it("rejects blank input", () => {
    expect(normalizeJudgemeShopDomain("   ")).toBeNull();
  });
});
