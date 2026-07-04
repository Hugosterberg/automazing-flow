import { describe, expect, it } from "vitest";
import { retryFailedScheduledPosts, type StoredScheduledPost } from "../../server/lib/scheduledPostsPublisher";

function post(partial: Partial<StoredScheduledPost> & { id: string }): StoredScheduledPost {
  return {
    caption: "Test",
    accountIds: [],
    platforms: [],
    status: "failed",
    scheduledFor: new Date().toISOString(),
    mediaUrls: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: "Network error",
    ...partial,
  };
}

describe("retryFailedScheduledPosts", () => {
  it("re-schedules a recently failed post once", () => {
    const now = Date.parse("2026-07-04T12:00:00.000Z");
    const { posts, retried } = retryFailedScheduledPosts(
      [post({ id: "1", updatedAt: "2026-07-04T11:00:00.000Z" })],
      now
    );
    expect(retried).toBe(1);
    expect(posts[0].status).toBe("scheduled");
    expect(posts[0].retryCount).toBe(1);
  });

  it("does not retry posts that already hit the retry limit", () => {
    const now = Date.parse("2026-07-04T12:00:00.000Z");
    const { posts, retried } = retryFailedScheduledPosts(
      [post({ id: "1", updatedAt: "2026-07-04T11:00:00.000Z", retryCount: 1 })],
      now
    );
    expect(retried).toBe(0);
    expect(posts[0].status).toBe("failed");
  });
});
