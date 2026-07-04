import { describe, expect, it } from "vitest";
import { portfolioScoreDeltaFromSnapshots } from "../../server/lib/marketingSnapshotTrend";

describe("portfolioScoreDeltaFromSnapshots", () => {
  it("returns delta vs ~7 day baseline", () => {
    const delta = portfolioScoreDeltaFromSnapshots([
      { snapshotDate: "2026-06-15", portfolioScore: 78 },
      { snapshotDate: "2026-06-08", portfolioScore: 65 },
    ]);
    expect(delta).toBe(13);
  });

  it("returns null without baseline", () => {
    expect(
      portfolioScoreDeltaFromSnapshots([{ snapshotDate: "2026-06-15", portfolioScore: 70 }]),
    ).toBeNull();
  });
});
