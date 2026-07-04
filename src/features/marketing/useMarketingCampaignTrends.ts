import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  computeCampaignTrends,
  campaignTrendKey,
  type CampaignSnapshot,
  type CampaignTrend,
} from "./campaignTrend";

export const MARKETING_CAMPAIGN_TREND_KEY = ["marketing-campaign-trend"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SnapshotsClient = { from: (table: string) => any };

/**
 * Week-over-week trends per campaign from daily marketing_campaign_snapshots.
 */
export function useMarketingCampaignTrends(): {
  trends: Map<string, CampaignTrend>;
  isLoading: boolean;
} {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { enabled, user } = useAuth();
  const query = useQuery<Map<string, CampaignTrend>>({
    queryKey: [...MARKETING_CAMPAIGN_TREND_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !businessProfileId) return new Map();
      const { data, error } = await (supabase as unknown as SnapshotsClient)
        .from("marketing_campaign_snapshots")
        .select(
          "snapshot_date, platform, campaign_id, campaign_name, spend, roas, score, grade",
        )
        .eq("business_profile_id", businessProfileId)
        .order("snapshot_date", { ascending: false })
        .limit(500);
      if (error) return new Map();
      const snapshots: CampaignSnapshot[] = (Array.isArray(data) ? data : []).map(
        (r: Record<string, unknown>) => ({
          snapshotDate: String(r.snapshot_date || ""),
          platform: String(r.platform || "") as CampaignSnapshot["platform"],
          campaignId: String(r.campaign_id || ""),
          campaignName: String(r.campaign_name || ""),
          spend: r.spend == null ? null : Number(r.spend),
          roas: r.roas == null ? null : Number(r.roas),
          score: r.score == null ? null : Number(r.score),
          grade: (r.grade as string | null) ?? null,
        }),
      );
      return computeCampaignTrends(snapshots);
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  return { trends: query.data ?? new Map(), isLoading: query.isLoading };
}

export { campaignTrendKey };
