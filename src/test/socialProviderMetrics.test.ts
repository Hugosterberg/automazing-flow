import { describe, expect, it } from "vitest";
import { calculateXMetrics } from "../../server/analytics/xMetrics.ts";
import { calculateEngagementFromPosts } from "../../server/analytics/socialMetrics.ts";

describe("calculateXMetrics", () => {
  const tweets = [
    { public_metrics: { like_count: 10, reply_count: 2, retweet_count: 1, impression_count: 500 } },
    { public_metrics: { like_count: 20, reply_count: 4, retweet_count: 3, impression_count: 1500 } },
  ];

  it("aggregates impressions into total and average views", () => {
    const stats = calculateXMetrics(tweets, 1000, 50, 200);
    expect(stats.totalViews).toBe(2000);
    expect(stats.avgViews).toBe(1000);
    expect(stats.totalComments).toBe(6);
    expect(stats.totalLikes).toBe(30);
    expect(stats.followersCount).toBe(1000);
  });

  it("omits view stats when impressions are missing", () => {
    const noViews = [
      { public_metrics: { like_count: 5, reply_count: 1, retweet_count: 0 } },
    ];
    const stats = calculateXMetrics(noViews, 100, 10, 20);
    expect(stats.totalViews).toBeUndefined();
    expect(stats.avgViews).toBeUndefined();
    expect(stats.totalLikes).toBe(5);
  });

  it("handles empty input", () => {
    const stats = calculateXMetrics([], undefined, undefined, undefined);
    expect(stats.totalViews).toBeUndefined();
    expect(stats.totalComments).toBeUndefined();
    expect(stats.engagementRate).toBeUndefined();
  });
});

describe("calculateEngagementFromPosts (provider media shapes)", () => {
  it("computes view averages for TikTok/YouTube style posts", () => {
    const posts = [
      { likeCount: 100, commentCount: 10, viewCount: 4000 },
      { likeCount: 200, commentCount: 20, viewCount: 6000 },
      { likeCount: 50, commentCount: 5 },
    ];
    const engagement = calculateEngagementFromPosts(posts, 10_000);
    expect(engagement.totalViews).toBe(10_000);
    expect(engagement.avgViews).toBe(5_000);
    expect(engagement.totalLikes).toBe(350);
    expect(engagement.engagementRate).toBeGreaterThan(0);
  });
});
