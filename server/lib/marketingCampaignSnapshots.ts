/**
 * Builds rows for marketing_campaign_snapshots from gathered ad platform data.
 * Pure — the cron upserts the result via the service role.
 */

import type { AdAccountCampaigns } from "../providers/metaAds.ts";

export interface CampaignSnapshotRow {
  business_profile_id: string;
  snapshot_date: string;
  platform: "meta_business" | "google_ads";
  campaign_id: string;
  campaign_name: string;
  spend: number | null;
  roas: number | null;
  score: number | null;
  grade: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

export function buildCampaignSnapshotRows(
  businessProfileId: string,
  snapshotDate: string,
  platforms: AdAccountCampaigns[],
): CampaignSnapshotRow[] {
  const rows: CampaignSnapshotRow[] = [];
  for (const group of platforms) {
    for (const campaign of group.campaigns) {
      if (!campaign.id) continue;
      const spend = campaign.spend7d ?? null;
      if (spend == null || spend <= 0) continue;
      rows.push({
        business_profile_id: businessProfileId,
        snapshot_date: snapshotDate,
        platform: group.platform,
        campaign_id: campaign.id,
        campaign_name: campaign.name || "Untitled campaign",
        spend,
        roas: campaign.metrics?.roas ?? campaign.roas7d ?? null,
        score: campaign.score?.score ?? null,
        grade: campaign.score?.grade ?? null,
        impressions: campaign.impressions7d ?? campaign.metrics?.impressions ?? null,
        clicks: campaign.clicks7d ?? campaign.metrics?.clicks ?? null,
        conversions: campaign.conversions7d ?? campaign.metrics?.conversions ?? null,
      });
    }
  }
  return rows;
}
