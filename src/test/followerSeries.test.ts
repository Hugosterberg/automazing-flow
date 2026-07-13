import { describe, expect, it } from "vitest";
import { buildFollowerSeries } from "@/features/insights/followerSeries";

describe("buildFollowerSeries", () => {
  it("returns empty without follower-reporting accounts", () => {
    expect(buildFollowerSeries([])).toEqual([]);
    expect(
      buildFollowerSeries([{ accountId: "a", snapshotDate: "2026-07-13", followers: null }])
    ).toEqual([]);
  });

  it("sums followers across accounts per day, ascending", () => {
    const series = buildFollowerSeries([
      { accountId: "a", snapshotDate: "2026-07-13", followers: 120 },
      { accountId: "b", snapshotDate: "2026-07-13", followers: 30 },
      { accountId: "a", snapshotDate: "2026-07-12", followers: 118 },
      { accountId: "b", snapshotDate: "2026-07-12", followers: 29 },
    ]);
    expect(series).toEqual([
      { date: "2026-07-12", followers: 147 },
      { date: "2026-07-13", followers: 150 },
    ]);
  });

  it("drops days where an account is missing, to avoid false dips", () => {
    const series = buildFollowerSeries([
      { accountId: "a", snapshotDate: "2026-07-13", followers: 120 },
      { accountId: "b", snapshotDate: "2026-07-13", followers: 30 },
      // b missing on the 12th — the total would look like a 30-follower drop.
      { accountId: "a", snapshotDate: "2026-07-12", followers: 118 },
    ]);
    expect(series).toEqual([{ date: "2026-07-13", followers: 150 }]);
  });

  it("ignores accounts that never report followers (e.g. review platforms)", () => {
    const series = buildFollowerSeries([
      { accountId: "a", snapshotDate: "2026-07-13", followers: 120 },
      { accountId: "reviews", snapshotDate: "2026-07-13", followers: null },
      { accountId: "a", snapshotDate: "2026-07-12", followers: 118 },
      { accountId: "reviews", snapshotDate: "2026-07-12", followers: null },
    ]);
    expect(series).toEqual([
      { date: "2026-07-12", followers: 118 },
      { date: "2026-07-13", followers: 120 },
    ]);
  });
});
