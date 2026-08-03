import { describe, expect, it, vi } from "vitest";
import {
  isPostDue,
  parseScheduledPostsDoc,
  publishDueScheduledPosts,
  type StoredScheduledPost,
} from "../../server/lib/scheduledPostsPublisher.ts";

function post(partial: Partial<StoredScheduledPost> & { id: string }): StoredScheduledPost {
  return {
    caption: "Test",
    accountIds: ["acc-1"],
    platforms: ["instagram"],
    status: "scheduled",
    scheduledFor: new Date().toISOString(),
    mediaUrls: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("isPostDue", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");

  it("is due when scheduled and the time has passed", () => {
    expect(isPostDue(post({ id: "1", scheduledFor: "2026-06-01T11:00:00Z" }), now)).toBe(true);
  });

  it("is not due when scheduled for the future", () => {
    expect(isPostDue(post({ id: "1", scheduledFor: "2026-06-01T13:00:00Z" }), now)).toBe(false);
  });

  it("is never due for a non-scheduled status", () => {
    expect(isPostDue(post({ id: "1", status: "published", scheduledFor: "2026-06-01T11:00:00Z" }), now)).toBe(
      false
    );
    expect(isPostDue(post({ id: "1", status: "draft", scheduledFor: "2026-06-01T11:00:00Z" }), now)).toBe(false);
  });

  it("is not due when scheduledFor is missing or unparseable", () => {
    expect(isPostDue(post({ id: "1", scheduledFor: null }), now)).toBe(false);
    expect(isPostDue(post({ id: "1", scheduledFor: "not-a-date" }), now)).toBe(false);
  });
});

describe("parseScheduledPostsDoc", () => {
  it("returns valid entries from an array", () => {
    const doc = [post({ id: "1" }), post({ id: "2" })];
    expect(parseScheduledPostsDoc(doc)).toHaveLength(2);
  });

  it("filters out malformed entries", () => {
    const doc = [post({ id: "1" }), { caption: "no id or status" }, null, "garbage"];
    const result = parseScheduledPostsDoc(doc);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns an empty array for non-array input", () => {
    expect(parseScheduledPostsDoc(null)).toEqual([]);
    expect(parseScheduledPostsDoc(undefined)).toEqual([]);
    expect(parseScheduledPostsDoc({})).toEqual([]);
  });
});

describe("publishDueScheduledPosts", () => {
  function makeSupabaseAdmin(rows: Array<{ id: string; business_profile_id: string; data: unknown }>) {
    const updateCalls: Array<{ id: string; data: unknown }> = [];
    return {
      updateCalls,
      admin: {
        from: (_table: string) => ({
          select: (_columns: string) => ({
            eq: async (_col: string, _val: string) => ({ data: rows, error: null }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updateCalls.push({ id, data: values.data });
              return { error: null };
            },
          }),
        }),
      },
    };
  }

  function makeTokenStore(stored: Record<string, Record<string, unknown>>) {
    return { get: async (accountId: string) => stored[accountId] ?? null };
  }

  it("publishes a due post and marks it published", async () => {
    const duePost = post({ id: "p1", scheduledFor: "2020-01-01T00:00:00Z" });
    const { admin, updateCalls } = makeSupabaseAdmin([{ id: "row-1", business_profile_id: "bp-1", data: [duePost] }]);
    const tokenStore = makeTokenStore({
      "acc-1": { platform: "instagram", zernioAccountId: "z-1", profileId: "bp-1" },
    });
    const createPost = vi.fn(async () => ({ ok: true, status: 200, data: {} }));

    const result = await publishDueScheduledPosts({
      supabaseAdmin: admin,
      zernio: { createPost } as never,
      tokenStore,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result).toEqual({ profiles: 1, due: 1, published: 1, failed: 0, retried: 0 });
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: [{ platform: "instagram", accountId: "z-1" }], publishNow: true })
    );
    expect(updateCalls[0].data).toEqual([expect.objectContaining({ id: "p1", status: "published" })]);
  });

  it("marks a post failed when no publishable account is found", async () => {
    const duePost = post({ id: "p1", scheduledFor: "2020-01-01T00:00:00Z" });
    const { admin, updateCalls } = makeSupabaseAdmin([{ id: "row-1", business_profile_id: "bp-1", data: [duePost] }]);
    const tokenStore = makeTokenStore({}); // no stored account for acc-1
    const createPost = vi.fn();

    const result = await publishDueScheduledPosts({
      supabaseAdmin: admin,
      zernio: { createPost } as never,
      tokenStore,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.failed).toBe(1);
    expect(result.published).toBe(0);
    expect(createPost).not.toHaveBeenCalled();
    expect(updateCalls[0].data).toEqual([
      expect.objectContaining({ id: "p1", status: "failed", error: expect.stringContaining("reconnect") }),
    ]);
  });

  it("marks a post failed when Zernio publish fails", async () => {
    const duePost = post({ id: "p1", scheduledFor: "2020-01-01T00:00:00Z" });
    const { admin } = makeSupabaseAdmin([{ id: "row-1", business_profile_id: "bp-1", data: [duePost] }]);
    const tokenStore = makeTokenStore({
      "acc-1": { platform: "instagram", zernioAccountId: "z-1", profileId: "bp-1" },
    });
    const createPost = vi.fn(async () => ({ ok: false, status: 502, data: {}, error: "upstream_down" }));

    const result = await publishDueScheduledPosts({
      supabaseAdmin: admin,
      zernio: { createPost } as never,
      tokenStore,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.failed).toBe(1);
    expect(result.published).toBe(0);
    expect(createPost).toHaveBeenCalledTimes(1);
  });

  it("skips profiles filtered out by shouldPublishForProfile", async () => {
    const duePost = post({ id: "p1", scheduledFor: "2020-01-01T00:00:00Z" });
    const { admin, updateCalls } = makeSupabaseAdmin([{ id: "row-1", business_profile_id: "bp-1", data: [duePost] }]);
    const createPost = vi.fn();

    const result = await publishDueScheduledPosts({
      supabaseAdmin: admin,
      zernio: { createPost } as never,
      tokenStore: makeTokenStore({}),
      now: new Date("2026-01-01T00:00:00Z"),
      shouldPublishForProfile: () => false,
    });

    expect(result).toEqual({ profiles: 1, due: 0, published: 0, failed: 0, retried: 0 });
    expect(createPost).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("ignores posts that are not yet due", async () => {
    const futurePost = post({ id: "p1", scheduledFor: "2030-01-01T00:00:00Z" });
    const { admin } = makeSupabaseAdmin([{ id: "row-1", business_profile_id: "bp-1", data: [futurePost] }]);
    const createPost = vi.fn();

    const result = await publishDueScheduledPosts({
      supabaseAdmin: admin,
      zernio: { createPost } as never,
      tokenStore: makeTokenStore({}),
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.due).toBe(0);
    expect(createPost).not.toHaveBeenCalled();
  });
});
