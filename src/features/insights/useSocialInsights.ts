import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  computeSocialStatsTrend,
  type SocialStatsSnapshotPoint,
  type SocialStatsTrend,
} from "@/features/social/socialStatsTrend";
import { buildFollowerSeries, type FollowerPoint } from "./followerSeries";

export const SOCIAL_INSIGHTS_KEY = ["social-insights"] as const;

// `social_stats_snapshots` isn't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the migration
type SnapshotsClient = { from: (table: string) => any };

export interface AccountInsight {
  accountId: string;
  platform: string;
  latest: SocialStatsSnapshotPoint | null;
  trend: SocialStatsTrend | null;
}

interface RawRow {
  accountId: string;
  platform: string;
  point: SocialStatsSnapshotPoint;
}

/**
 * All of a tenant's social snapshot history (last 30 days) shaped for the
 * Insights page: an aggregated follower series for the chart plus a per-account
 * latest value + week-over-week trend. Member-scoped via RLS; silent before the
 * migration has landed.
 */
export function useSocialInsights(businessProfileId: string | null): {
  followerSeries: FollowerPoint[];
  accounts: AccountInsight[];
  isLoading: boolean;
} {
  const { enabled, user } = useAuth();
  const query = useQuery<RawRow[]>({
    queryKey: [...SOCIAL_INSIGHTS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !businessProfileId) return [];
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await (supabase as unknown as SnapshotsClient)
        .from("social_stats_snapshots")
        .select(
          "account_id, platform, snapshot_date, followers, following, media_count, avg_likes, avg_comments, avg_views, engagement_rate, average_rating, review_count"
        )
        .eq("business_profile_id", businessProfileId)
        .gte("snapshot_date", since)
        .order("snapshot_date", { ascending: false })
        .limit(1000);
      if (error) return [];
      return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
        accountId: String(r.account_id || ""),
        platform: String(r.platform || ""),
        point: {
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
        },
      }));
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const followerSeries = useMemo(
    () =>
      buildFollowerSeries(
        rows.map((r) => ({
          accountId: r.accountId,
          snapshotDate: r.point.snapshotDate,
          followers: r.point.followers,
        }))
      ),
    [rows]
  );

  const accounts = useMemo(() => {
    const byAccount = new Map<string, RawRow[]>();
    for (const row of rows) {
      const list = byAccount.get(row.accountId) ?? [];
      list.push(row);
      byAccount.set(row.accountId, list);
    }
    const out: AccountInsight[] = [];
    for (const [accountId, list] of byAccount) {
      const points = list.map((r) => r.point);
      const latest = [...points].sort(
        (a, b) => Date.parse(b.snapshotDate) - Date.parse(a.snapshotDate)
      )[0] ?? null;
      out.push({
        accountId,
        platform: list[0]?.platform ?? "",
        latest,
        trend: computeSocialStatsTrend(points),
      });
    }
    // Biggest audiences first so the list leads with what matters.
    return out.sort((a, b) => (b.latest?.followers ?? 0) - (a.latest?.followers ?? 0));
  }, [rows]);

  return { followerSeries, accounts, isLoading: query.isLoading };
}
