import { describe, expect, it } from "vitest";
import { computeCampaignTrends, type CampaignSnapshot } from "../features/marketing/campaignTrend";

function snap(
  date: string,
  platform: "meta_business" | "google_ads",
  id: string,
  score: number,
  grade: string,
): CampaignSnapshot {
  return {
    snapshotDate: date,
    platform,
    campaignId: id,
    campaignName: "Test",
    score,
    grade,
    roas: 2,
    spend: 500,
  };
}

describe("computeCampaignTrends", () => {
  it("detects improving score week over week", () => {
    const trends = computeCampaignTrends([
      snap("2026-06-15", "meta_business", "1", 82, "B"),
      snap("2026-06-08", "meta_business", "1", 65, "C"),
    ]);
    const t = trends.get("meta_business:1");
    expect(t?.direction).toBe("up");
    expect(t?.scoreDelta).toBe(17);
    expect(t?.previousGrade).toBe("C");
  });

  it("detects declining score", () => {
    const trends = computeCampaignTrends([
      snap("2026-06-15", "google_ads", "9", 40, "F"),
      snap("2026-06-08", "google_ads", "9", 72, "B"),
    ]);
    expect(trends.get("google_ads:9")?.direction).toBe("down");
  });
});
