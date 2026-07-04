import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ConnectedAccount } from "@/types/accounts";

/** Aggregated metrics across all connected social accounts in the profile. */
export function SocialOverviewCard({ accounts }: { accounts: ConnectedAccount[] }) {
  const numberFmt = useMemo(() => new Intl.NumberFormat("en-US"), []);

  const overviewData = useMemo(() => {
    const summary = accounts.reduce(
      (acc, a) => {
        acc.connected += 1;
        if (typeof a.stats?.followersCount === "number") { acc.followers += a.stats.followersCount; acc.hasFollowers = true; }
        if (typeof a.stats?.mediaCount === "number") { acc.posts += a.stats.mediaCount; acc.hasPosts = true; }
        if (typeof a.stats?.engagementRate === "number") { acc.engagementSum += a.stats.engagementRate; acc.engagementCount += 1; }
        if (typeof a.stats?.totalLikes === "number") { acc.totalLikes += a.stats.totalLikes; acc.hasTotalLikes = true; }
        if (typeof a.stats?.totalComments === "number") { acc.totalComments += a.stats.totalComments; acc.hasTotalComments = true; }
        if (typeof a.stats?.avgLikes === "number") { acc.avgLikesSum += a.stats.avgLikes; acc.avgLikesCount += 1; }
        if (typeof a.stats?.avgComments === "number") { acc.avgCommentsSum += a.stats.avgComments; acc.avgCommentsCount += 1; }
        if (typeof a.stats?.updatedAt === "string") {
          const ts = Date.parse(a.stats.updatedAt);
          if (!Number.isNaN(ts) && ts > acc.lastUpdatedTs) { acc.lastUpdatedTs = ts; acc.lastUpdatedIso = a.stats.updatedAt; }
        }
        return acc;
      },
      { connected: 0, followers: 0, posts: 0, engagementSum: 0, engagementCount: 0, hasFollowers: false, hasPosts: false, totalLikes: 0, totalComments: 0, avgLikesSum: 0, avgLikesCount: 0, avgCommentsSum: 0, avgCommentsCount: 0, hasTotalLikes: false, hasTotalComments: false, lastUpdatedTs: 0, lastUpdatedIso: null as string | null }
    );

    const byPlatform = accounts.reduce<Record<string, { accounts: number; followers: number; posts: number }>>(
      (acc, a) => {
        const entry = acc[a.platform] ?? { accounts: 0, followers: 0, posts: 0 };
        entry.accounts += 1;
        if (typeof a.stats?.followersCount === "number") entry.followers += a.stats.followersCount;
        if (typeof a.stats?.mediaCount === "number") entry.posts += a.stats.mediaCount;
        acc[a.platform] = entry;
        return acc;
      },
      {}
    );

    return {
      ...summary,
      avgLikes: summary.avgLikesCount > 0 ? summary.avgLikesSum / summary.avgLikesCount : null,
      avgComments: summary.avgCommentsCount > 0 ? summary.avgCommentsSum / summary.avgCommentsCount : null,
      byPlatform: Object.entries(byPlatform).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [accounts]);

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Total overview</span>
      </div>
      <Card className="bg-card border-border">
        <CardContent className="py-5 px-6">
          <p className="text-xs text-muted-foreground mb-4">
            Aggregated social media metrics for all connected accounts in this profile.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Connected accounts</p>
              <p className="font-semibold">{numberFmt.format(overviewData.connected)}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total followers</p>
              <p className="font-semibold">{overviewData.hasFollowers ? numberFmt.format(overviewData.followers) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total posts/templates</p>
              <p className="font-semibold">{overviewData.hasPosts ? numberFmt.format(overviewData.posts) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Average engagement rate</p>
              <p className="font-semibold">
                {overviewData.engagementCount > 0 ? `${(overviewData.engagementSum / overviewData.engagementCount).toFixed(1)}%` : "–"}
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total likes</p>
              <p className="font-semibold">{overviewData.hasTotalLikes ? numberFmt.format(overviewData.totalLikes) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total comments</p>
              <p className="font-semibold">{overviewData.hasTotalComments ? numberFmt.format(overviewData.totalComments) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Average likes/account</p>
              <p className="font-semibold">{overviewData.avgLikes != null ? overviewData.avgLikes.toFixed(1) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Average comments/account</p>
              <p className="font-semibold">{overviewData.avgComments != null ? overviewData.avgComments.toFixed(1) : "–"}</p>
            </div>
          </div>

          <div className="rounded-md border border-border mt-4">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground">Breakdown by platform</p>
            </div>
            <div className="px-3 py-2 space-y-2">
              {overviewData.byPlatform.length === 0 ? (
                <p className="text-xs text-muted-foreground">No connected social accounts yet.</p>
              ) : (
                overviewData.byPlatform.map(([platform, values]) => (
                  <div key={platform} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{platform.replace("_", " ")}</span>
                    <span className="text-muted-foreground">
                      {values.accounts} acc · {numberFmt.format(values.followers)} followers · {numberFmt.format(values.posts)} posts
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            Last update:{" "}
            {overviewData.lastUpdatedIso
              ? new Date(overviewData.lastUpdatedIso).toLocaleString("sv-SE")
              : "No stats timestamp available"}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
