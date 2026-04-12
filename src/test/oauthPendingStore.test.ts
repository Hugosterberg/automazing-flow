import { describe, expect, it } from "vitest";
import { createOAuthPendingStore } from "../../server/lib/oauthPendingStore.js";

describe("createOAuthPendingStore (memory fallback)", () => {
  it("deleteExpired removes stale entries by createdAt", async () => {
    const map = new Map<string, Record<string, unknown>>();
    const store = createOAuthPendingStore({ supabaseAdmin: null, fallbackMap: map });
    const old = Date.now() - 50 * 60 * 1000;
    map.set("fresh", { platform: "x", userId: "u1", createdAt: Date.now() });
    map.set("stale", { platform: "x", userId: "u1", createdAt: old });
    const { removed } = await store.deleteExpired();
    expect(removed).toBe(1);
    expect(map.has("stale")).toBe(false);
    expect(map.has("fresh")).toBe(true);
  });

  it("get returns null and deletes when entry is past max age", async () => {
    const map = new Map<string, Record<string, unknown>>();
    const store = createOAuthPendingStore({ supabaseAdmin: null, fallbackMap: map });
    const old = Date.now() - 50 * 60 * 1000;
    map.set("gone", { platform: "gmail", userId: "u1", createdAt: old });
    const v = await store.get("gone");
    expect(v).toBeNull();
    expect(map.has("gone")).toBe(false);
  });
});
