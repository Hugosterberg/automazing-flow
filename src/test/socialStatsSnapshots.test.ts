import { describe, expect, it } from "vitest";
import { buildSocialStatsSnapshotRow } from "../../server/lib/socialStatsSnapshots";
import {
  computeSocialStatsTrend,
  formatStatChange,
  type SocialStatsSnapshotPoint,
} from "@/features/social/socialStatsTrend";

describe("buildSocialStatsSnapshotRow", () => {
  const account = {
    id: "acc-1",
    business_profile_id: "bp-1",
    platform: "instagram",
    stats: {
      followersCount: 1200,
      mediaCount: 34,
      engagementRate: 4.2,
      updatedAt: "2026-07-12T18:00:00.000Z",
    },
  };

  it("maps stats fields into a snapshot row", () => {
    const row = buildSocialStatsSnapshotRow(account, "2026-07-13");
    expect(row).toMatchObject({
      business_profile_id: "bp-1",
      account_id: "acc-1",
      snapshot_date: "2026-07-13",
      platform: "instagram",
      followers: 1200,
      media_count: 34,
      engagement_rate: 4.2,
      stats_updated_at: "2026-07-12T18:00:00.000Z",
    });
    expect(row?.avg_likes).toBeNull();
  });

  it("skips non-social platforms", () => {
    expect(buildSocialStatsSnapshotRow({ ...account, platform: "gmail" }, "2026-07-13")).toBeNull();
  });

  it("skips accounts without a tenant", () => {
    expect(
      buildSocialStatsSnapshotRow({ ...account, business_profile_id: null }, "2026-07-13")
    ).toBeNull();
  });

  it("skips stats blobs without any numeric KPI", () => {
    expect(
      buildSocialStatsSnapshotRow(
        { ...account, stats: { accountType: "BUSINESS", updatedAt: "2026-07-12T18:00:00.000Z" } },
        "2026-07-13"
      )
    ).toBeNull();
  });

  it("ignores non-finite metric values", () => {
    const row = buildSocialStatsSnapshotRow(
      { ...account, stats: { followersCount: Number.NaN, mediaCount: 10 } },
      "2026-07-13"
    );
    expect(row?.followers).toBeNull();
    expect(row?.media_count).toBe(10);
  });
});

function point(overrides: Partial<SocialStatsSnapshotPoint>): SocialStatsSnapshotPoint {
  return {
    snapshotDate: "2026-07-13",
    followers: null,
    following: null,
    mediaCount: null,
    avgLikes: null,
    avgComments: null,
    avgViews: null,
    engagementRate: null,
    averageRating: null,
    reviewCount: null,
    ...overrides,
  };
}

describe("computeSocialStatsTrend", () => {
  it("returns null with fewer than two distinct days", () => {
    expect(computeSocialStatsTrend([])).toBeNull();
    expect(computeSocialStatsTrend([point({ followers: 100 })])).toBeNull();
    expect(
      computeSocialStatsTrend([point({ followers: 100 }), point({ followers: 90 })])
    ).toBeNull();
  });

  it("compares against the snapshot closest to a week back", () => {
    const trend = computeSocialStatsTrend([
      point({ snapshotDate: "2026-07-13", followers: 120, engagementRate: 4.5 }),
      point({ snapshotDate: "2026-07-10", followers: 115 }),
      point({ snapshotDate: "2026-07-06", followers: 100, engagementRate: 4.0 }),
      point({ snapshotDate: "2026-07-01", followers: 80 }),
    ]);
    expect(trend).not.toBeNull();
    expect(trend?.baselineDate).toBe("2026-07-06");
    expect(trend?.spanDays).toBe(7);
    expect(trend?.deltas.followers).toBe(20);
    expect(trend?.deltas.engagementRate).toBeCloseTo(0.5);
    // Metrics missing in either endpoint stay absent.
    expect(trend?.deltas.mediaCount).toBeUndefined();
  });

  it("falls back to the oldest snapshot when history is shorter than a week", () => {
    const trend = computeSocialStatsTrend([
      point({ snapshotDate: "2026-07-13", followers: 105 }),
      point({ snapshotDate: "2026-07-11", followers: 100 }),
    ]);
    expect(trend?.baselineDate).toBe("2026-07-11");
    expect(trend?.spanDays).toBe(2);
    expect(trend?.deltas.followers).toBe(5);
  });
});

describe("formatStatChange", () => {
  it("formats signed deltas with the window", () => {
    expect(formatStatChange(12, 7)).toBe("+12 (7d)");
    expect(formatStatChange(-3, 7)).toBe("−3 (7d)");
    expect(formatStatChange(0.42, 7, { decimals: 1, suffix: "%" })).toBe("+0.4% (7d)");
    expect(formatStatChange(1234, 7)).toBe("+1,234 (7d)");
  });

  it("returns empty for deltas that round to zero", () => {
    expect(formatStatChange(0, 7)).toBe("");
    expect(formatStatChange(0.04, 7, { decimals: 1 })).toBe("");
  });
});
