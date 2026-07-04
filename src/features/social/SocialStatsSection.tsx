import { useMemo } from "react";
import { m } from "framer-motion";
import { Users, FileText, Heart, Eye, Star, Loader2, ImagePlus } from "lucide-react";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Button } from "@/components/ui/button";
import type { ConnectedAccount } from "@/types/accounts";
import type { SocialMediaApiPost } from "./socialApiTypes";

const defaultStats = [
  { label: "Followers", value: "–", change: "", icon: Users, key: "followers" },
  { label: "Following", value: "–", change: "", icon: Users, key: "following" },
  { label: "Posts", value: "–", change: "", icon: FileText, key: "media" },
  { label: "Engagement", value: "–", change: "", icon: Heart, key: "engagement" },
];

/**
 * Per-account KPI cards + recent posts grid for the Social page, with the
 * platform-specific stat picking (GBP ratings, X tweets, WhatsApp templates,
 * Instagram views) that used to live inline in SocialMedia.tsx.
 */
export function SocialStatsSection({
  account,
  loading,
  onRefresh,
  posts,
}: {
  account: ConnectedAccount | null;
  loading: boolean;
  onRefresh: () => void;
  posts: SocialMediaApiPost[];
}) {
  const numberFmt = useMemo(() => new Intl.NumberFormat("en-US"), []);

  const stats = useMemo(() => {
    const s = account?.stats;
    if (!s || !account) return defaultStats;
    const isGbp = account.platform === "google_business";
    if (isGbp) {
      return [
        {
          ...defaultStats[0],
          key: "gbp-rating",
          label: "Avg. rating",
          value: s.averageRating != null ? s.averageRating.toFixed(1) : "–",
          change: "",
          icon: Star,
        },
        {
          ...defaultStats[1],
          key: "gbp-reviews",
          label: "Reviews",
          value: s.reviewCount != null ? s.reviewCount.toLocaleString("en-US") : "–",
          change: "",
          icon: FileText,
        },
        { ...defaultStats[2], key: "gbp-posts", label: "Posts", value: "–" },
        { ...defaultStats[3], key: "gbp-engagement", label: "Engagement", value: "–" },
      ];
    }
    const isX = account.platform === "x";
    const isWhatsApp = account.platform === "whatsapp";
    const isInstagram = account.platform === "instagram";

    const avgLikesStat =
      isInstagram && s.avgViews != null
        ? { key: "avg-views", label: "Avg. views", value: s.avgViews.toLocaleString("en-US"), change: "", icon: Eye }
        : s.avgLikes != null
        ? { key: "avg-likes", label: "Avg. likes", value: String(s.avgLikes), change: "", icon: Heart }
        : s.followingCount != null
          ? { ...defaultStats[1], value: s.followingCount.toLocaleString("en-US") }
          : { ...defaultStats[1], value: "–" };

    const engagementStat =
      s.engagementRate != null
        ? { ...defaultStats[3], value: s.engagementRate.toFixed(1) + "%", change: "" }
        : defaultStats[3];

    return [
      {
        ...defaultStats[0],
        value: s.followersCount != null ? s.followersCount.toLocaleString("en-US") : "–",
      },
      avgLikesStat,
      {
        ...defaultStats[2],
        label: isX ? "Tweets" : isWhatsApp ? "Templates" : "Posts",
        value: s.mediaCount != null ? s.mediaCount.toLocaleString("en-US") : "–",
      },
      engagementStat,
    ];
  }, [account]);

  return (
    <>
      {account && (account.isOAuth || account.isZernio) && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={onRefresh}
            className="text-muted-foreground"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Loading...
              </>
            ) : (
              "Refresh stats"
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing data for {account.username}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <m.div key={stat.key} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.08 }}>
            <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                  {loading && account && i < 3 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    stat.change && <span className="text-xs text-green-400 font-medium">{stat.change}</span>
                  )}
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </m.div>
        ))}
      </div>

      {account?.stats?.zernioNote && (
        <m.div {...fadeUp} transition={{ duration: 0.3, delay: 0.12 }}>
          <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2.5 bg-muted/30 leading-relaxed">
            {account.stats.zernioNote}
          </p>
        </m.div>
      )}

      {posts.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.25 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" />
                {account?.platform === "whatsapp" ? "WhatsApp templates" : "Recent posts"}
              </CardTitle>
              <CardDescription>
                {account?.platform === "whatsapp"
                  ? "Approved templates from your WhatsApp Business account (via Zernio)"
                  : account?.platform === "instagram"
                    ? "Views, likes and comments per post"
                    : "Likes and comments per post"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Image grid for visual platforms (Instagram etc.) */}
              {posts[0]?.picture ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {posts.map((post) => (
                    <a
                      key={post.id}
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                    >
                      <ImageWithFallback
                        src={post.picture}
                        alt={post.caption.slice(0, 40)}
                        className="w-full h-full object-cover"
                        fallback={
                          <div className="w-full h-full flex items-center justify-center bg-secondary/40">
                            <ImagePlus className="h-6 w-6 text-muted-foreground" />
                          </div>
                        }
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <div className="flex items-center gap-1 text-white text-xs font-semibold">
                          <Heart className="h-3.5 w-3.5 fill-white" />
                          {post.likeCount}
                        </div>
                        {account?.platform === "instagram" && (
                          <div className="flex items-center gap-1 text-white text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            {post.viewCount != null ? numberFmt.format(post.viewCount) : "–"}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-white text-xs">
                          <FileText className="h-3.5 w-3.5" />
                          {post.commentCount}
                        </div>
                      </div>
                      <div className="absolute bottom-1 left-1 flex gap-1">
                        <span className="bg-black/70 text-white text-[11px] px-1 py-0.5 rounded flex items-center gap-0.5">
                          <Heart className="h-2.5 w-2.5 fill-white" />{post.likeCount}
                        </span>
                        {account?.platform === "instagram" && (
                          <span className="bg-black/70 text-white text-[11px] px-1 py-0.5 rounded flex items-center gap-0.5">
                            <Eye className="h-2.5 w-2.5" />{post.viewCount != null ? numberFmt.format(post.viewCount) : "–"}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                /* Text list for text-based platforms (X/Twitter) */
                <div className="space-y-2">
                  {posts.map((post) => {
                    const inner = (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-relaxed line-clamp-2">{post.caption}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground pt-0.5">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" />
                            {post.likeCount}
                          </span>
                          {account?.platform === "instagram" && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" />
                              {post.viewCount != null ? numberFmt.format(post.viewCount) : "–"}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {post.commentCount}
                          </span>
                        </div>
                      </>
                    );
                    return post.permalink ? (
                      <a
                        key={post.id}
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/40 transition-colors group"
                      >
                        {inner}
                      </a>
                    ) : (
                      <div
                        key={post.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20"
                      >
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </m.div>
      )}
    </>
  );
}
