import { describe, expect, it } from "vitest";
import {
  buildOptimizedCaption,
  buildRepurposeVariants,
  countUpcomingPosts,
  pickEvergreenPost,
  pickHeroPost,
} from "../../server/lib/contentCreativeJobs";
import type { StoredScheduledPost } from "../../server/lib/scheduledPostsPublisher";

function post(partial: Partial<StoredScheduledPost> & { id: string }): StoredScheduledPost {
  return {
    caption: "Hello world",
    accountIds: ["acc-1"],
    platforms: ["instagram"],
    status: "published",
    scheduledFor: null,
    mediaUrls: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("contentCreativeJobs", () => {
  it("picks the most recent published hero within the window", () => {
    const now = Date.parse("2026-07-04T12:00:00.000Z");
    const posts = [
      post({ id: "1", caption: "Old hero", updatedAt: "2026-06-20T10:00:00.000Z" }),
      post({ id: "2", caption: "Fresh hero", updatedAt: "2026-07-02T10:00:00.000Z" }),
    ];
    expect(pickHeroPost(posts, now)?.id).toBe("2");
  });

  it("counts upcoming scheduled posts within 72h", () => {
    const now = Date.parse("2026-07-04T12:00:00.000Z");
    const posts = [
      post({ id: "1", status: "scheduled", scheduledFor: "2026-07-05T10:00:00.000Z" }),
      post({ id: "2", status: "draft", scheduledFor: "2026-07-10T10:00:00.000Z" }),
      post({ id: "3", status: "published", scheduledFor: "2026-07-05T10:00:00.000Z" }),
    ];
    expect(countUpcomingPosts(posts, now, 72)).toBe(1);
  });

  it("builds three repurpose variants from a hero post", () => {
    const hero = post({ id: "hero", caption: "Launch day recap\n\nWe shipped!" });
    const variants = buildRepurposeVariants(hero, "2026-07-04T12:00:00.000Z");
    expect(variants).toHaveLength(3);
    expect(variants[0].title).toMatch(/^Clip:/);
    expect(variants.every((v) => v.status === "queued")).toBe(true);
  });

  it("adds hashtags when optimizing captions", () => {
    const caption = buildOptimizedCaption("Summer sale", "Limited time", ["instagram"]);
    expect(caption).toContain("#smallbusiness");
  });

  it("picks evergreen posts older than 30 days", () => {
    const now = Date.parse("2026-07-04T12:00:00.000Z");
    const posts = [
      post({ id: "1", updatedAt: "2026-06-20T10:00:00.000Z" }),
      post({ id: "2", updatedAt: "2026-05-01T10:00:00.000Z", caption: "Classic tip" }),
    ];
    expect(pickEvergreenPost(posts, now)?.id).toBe("2");
  });
});
