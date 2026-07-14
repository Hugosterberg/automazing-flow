import { Link } from "react-router-dom";
import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeMedium, formatNumber } from "@/lib/format";
import type { ConnectedAccount } from "@/types/accounts";

/** Aggregated metrics across all connected social accounts in the profile. */
export function SocialOverviewCard({ accounts }: { accounts: ConnectedAccount[] }) {
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
        <span className="text-sm font-medium text-muted-foreground">Total översikt</span>
      </div>
      <Card className="bg-card border-border">
        <CardContent className="py-5 px-6">
          <p className="text-xs text-muted-foreground mb-4">
            Samlad statistik för alla kopplade sociala konton i den här profilen.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Kopplade konton</p>
              <p className="font-semibold">{formatNumber(overviewData.connected)}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total followers</p>
              <p className="font-semibold">{overviewData.hasFollowers ? formatNumber(overviewData.followers) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total posts/templates</p>
              <p className="font-semibold">{overviewData.hasPosts ? formatNumber(overviewData.posts) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Average engagement rate</p>
              <p className="font-semibold">
                {overviewData.engagementCount > 0 ? `${(overviewData.engagementSum / overviewData.engagementCount).toFixed(1)}%` : "–"}
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total likes</p>
              <p className="font-semibold">{overviewData.hasTotalLikes ? formatNumber(overviewData.totalLikes) : "–"}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total comments</p>
              <p className="font-semibold">{overviewData.hasTotalComments ? formatNumber(overviewData.totalComments) : "–"}</p>
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
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Inga sociala konton kopplade ännu.</p>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <Link to="/connections">Öppna Kopplingar</Link>
                  </Button>
                </div>
              ) : (
                overviewData.byPlatform.map(([platform, values]) => (
                  <div key={platform} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{platform.replace("_", " ")}</span>
                    <span className="text-muted-foreground">
                      {values.accounts} acc · {formatNumber(values.followers)} followers · {formatNumber(values.posts)} posts
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            Senast uppdaterad:{" "}
            {formatDateTimeMedium(overviewData.lastUpdatedIso) || "Ingen tidsstämpel tillgänglig"}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
