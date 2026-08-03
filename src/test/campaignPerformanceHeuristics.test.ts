import { describe, expect, it } from "vitest";
import {
  highPerformingCampaignHeuristic,
  underperformingCampaignHeuristic,
  type CampaignSnapshot,
  type TenantSnapshot,
} from "../../server/ai/recommendations/heuristics";

function snapshotWithCampaigns(campaigns: CampaignSnapshot[]): TenantSnapshot {
  return {
    businessProfileId: "bp-1",
    accounts: [],
    tasks: [],
    socialEngagementTrends: [],
    upcomingPostsCount: null,
    campaigns,
    leads: [],
  };
}

describe("underperformingCampaignHeuristic", () => {
  it("flags campaigns with ROAS below 1x", () => {
    const snapshot = snapshotWithCampaigns([
      { campaignId: "c1", platform: "meta_business", name: "Summer sale", roas7d: 0.6, grade: "F", spend7d: 200 },
    ]);
    const out = underperformingCampaignHeuristic(snapshot);
    expect(out).toHaveLength(1);
    expect(out[0].signal).toBe("underperforming_campaign");
    expect(out[0].relatedId).toBe("c1");
  });

  it("ignores campaigns with unknown ROAS", () => {
    const snapshot = snapshotWithCampaigns([
      { campaignId: "c1", platform: "meta_business", name: "Summer sale", roas7d: null, grade: null, spend7d: null },
    ]);
    expect(underperformingCampaignHeuristic(snapshot)).toHaveLength(0);
  });
});

describe("highPerformingCampaignHeuristic", () => {
  it("suggests scaling up a strongly profitable, well-spent campaign", () => {
    const snapshot = snapshotWithCampaigns([
      { campaignId: "c2", platform: "google_ads", name: "Winter collection", roas7d: 4.2, grade: "A", spend7d: 300 },
    ]);
    const out = highPerformingCampaignHeuristic(snapshot);
    expect(out).toHaveLength(1);
    expect(out[0].signal).toBe("high_performing_campaign");
    expect(out[0].suggestedAction).toEqual({ type: "navigate", to: "/marketing" });
  });

  it("ignores campaigns just above break-even", () => {
    const snapshot = snapshotWithCampaigns([
      { campaignId: "c3", platform: "google_ads", name: "Barely profitable", roas7d: 1.5, grade: "C", spend7d: 300 },
    ]);
    expect(highPerformingCampaignHeuristic(snapshot)).toHaveLength(0);
  });

  it("ignores a high-ROAS campaign with too little spend to be meaningful", () => {
    const snapshot = snapshotWithCampaigns([
      { campaignId: "c4", platform: "meta_business", name: "Tiny test", roas7d: 6, grade: "A", spend7d: 5 },
    ]);
    expect(highPerformingCampaignHeuristic(snapshot)).toHaveLength(0);
  });

  it("never overlaps with the underperforming heuristic for the same campaign", () => {
    const campaigns: CampaignSnapshot[] = [
      { campaignId: "c5", platform: "meta_business", name: "Mixed", roas7d: 0.4, grade: "F", spend7d: 500 },
    ];
    const snapshot = snapshotWithCampaigns(campaigns);
    expect(underperformingCampaignHeuristic(snapshot)).toHaveLength(1);
    expect(highPerformingCampaignHeuristic(snapshot)).toHaveLength(0);
  });
});
