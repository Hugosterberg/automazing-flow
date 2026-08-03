import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { asUntypedSupabaseClient } from "@/lib/untypedSupabaseClient";
import {
  computeSocialStatsTrend,
  type SocialStatsSnapshotPoint,
  type SocialStatsTrend,
} from "./socialStatsTrend";

export const SOCIAL_STATS_TREND_KEY = ["social-stats-trend"] as const;

/**
 * Week-over-week KPI trend for one connected account, read from the daily
 * social_stats_snapshots the cron writes (member-scoped via RLS). Silent +
 * cached: a missing table (before the migration) just yields no trend.
 */
export function useSocialStatsTrend(accountId: string | null): {
  trend: SocialStatsTrend | null;
  isLoading: boolean;
} {
  const { enabled, user } = useAuth();
  const query = useQuery<SocialStatsTrend | null>({
    queryKey: [...SOCIAL_STATS_TREND_KEY, user?.id ?? null, accountId ?? null],
    queryFn: async () => {
      if (!supabase || !accountId) return null;
      const { data, error } = await asUntypedSupabaseClient(supabase)
        .from("social_stats_snapshots")
        .select(
          "snapshot_date, followers, following, media_count, avg_likes, avg_comments, avg_views, engagement_rate, average_rating, review_count"
        )
        .eq("account_id", accountId)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) return null;
      const points: SocialStatsSnapshotPoint[] = (Array.isArray(data) ? data : []).map(
        (r: Record<string, unknown>) => ({
          snapshotDate: String(r.snapshot_date || ""),
          followers: r.followers == null ? null : Number(r.followers),
          following: r.following == null ? null : Number(r.following),
          mediaCount: r.media_count == null ? null : Number(r.media_count),
          avgLikes: r.avg_likes == null ? null : Number(r.avg_likes),
          avgComments: r.avg_comments == null ? null : Number(r.avg_comments),
          avgViews: r.avg_views == null ? null : Number(r.avg_views),
          engagementRate: r.engagement_rate == null ? null : Number(r.engagement_rate),
          averageRating: r.average_rating == null ? null : Number(r.average_rating),
          reviewCount: r.review_count == null ? null : Number(r.review_count),
        })
      );
      return computeSocialStatsTrend(points);
    },
    enabled: Boolean(supabase && enabled && accountId),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  return { trend: query.data ?? null, isLoading: query.isLoading };
}
