import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { computeMarketingTrend, type MarketingSnapshot, type MarketingTrend } from "./marketingTrend";

export const MARKETING_TREND_KEY = ["marketing-trend"] as const;

// `marketing_snapshots` isn't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the migration
type SnapshotsClient = { from: (table: string) => any };

/**
 * Week-over-week marketing trend, read from the daily marketing_snapshots the
 * cron writes (member-scoped via RLS). Silent + cached: a missing table (before
 * the migration) just yields an empty trend.
 */
export function useMarketingTrend(): { trend: MarketingTrend | null; isLoading: boolean } {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { enabled, user } = useAuth();
  const query = useQuery<MarketingTrend>({
    queryKey: [...MARKETING_TREND_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !businessProfileId) return computeMarketingTrend([]);
      const { data, error } = await (supabase as unknown as SnapshotsClient)
        .from("marketing_snapshots")
        .select("snapshot_date, ad_spend, revenue, orders, roas, currency, portfolio_score, portfolio_grade, campaigns_poor")
        .eq("business_profile_id", businessProfileId)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) return computeMarketingTrend([]);
      const snapshots: MarketingSnapshot[] = (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
        snapshotDate: String(r.snapshot_date || ""),
        adSpend: r.ad_spend == null ? null : Number(r.ad_spend),
        revenue: r.revenue == null ? null : Number(r.revenue),
        orders: r.orders == null ? null : Number(r.orders),
        roas: r.roas == null ? null : Number(r.roas),
        currency: (r.currency as string | null) ?? null,
        portfolioScore: r.portfolio_score == null ? null : Number(r.portfolio_score),
        portfolioGrade: (r.portfolio_grade as string | null) ?? null,
        campaignsPoor: r.campaigns_poor == null ? null : Number(r.campaigns_poor),
      }));
      return computeMarketingTrend(snapshots);
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  return { trend: query.data ?? null, isLoading: query.isLoading };
}
