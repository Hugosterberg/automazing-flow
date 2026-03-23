import { motion } from "framer-motion";
import {
  Users,
  FileText,
  Sparkles,
  Clock,
  Heart,
  Eye,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRef, useState, useEffect, useCallback } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import {
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
  XIcon,
  FacebookIcon,
  GoogleBusinessIcon,
  WhatsAppIcon,
} from "@/components/platform-icons";
import type { SocialPlatform } from "@/types/accounts";

const platformIcons: Record<SocialPlatform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  x: XIcon,
  facebook: FacebookIcon,
  google_business: GoogleBusinessIcon,
  whatsapp: WhatsAppIcon,
};


const defaultStats = [
  { label: "Followers", value: "–", change: "", icon: Users, key: "followers" },
  { label: "Following", value: "–", change: "", icon: Users, key: "following" },
  { label: "Posts", value: "–", change: "", icon: FileText, key: "media" },
  { label: "Engagement", value: "–", change: "", icon: Heart, key: "engagement" },
];

const scheduledPosts = [
  { title: "Product launch – Instagram", time: "Today 14:00", platform: "Instagram" },
  { title: "Tips & tricks video", time: "Tomorrow 09:00", platform: "TikTok" },
  { title: "Weekly recap", time: "Fri 18:00", platform: "LinkedIn" },
];

const contentIdeas = [
  "Behind the scenes – show your work process",
  "Customer review in carousel format",
  "5 tips in your industry (Reels)",
  "Before/after transformation",
  "Q&A with your followers",
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

/** Maps old error codes to current Zernio names */
const OAUTH_ERROR_ALIASES: Record<string, string> = {
  late_profile_failed: "zernio_profile_failed",
  late_not_configured: "zernio_not_configured",
  late_connect_failed: "zernio_connect_failed",
  late_fetch_accounts_failed: "zernio_fetch_accounts_failed",
  late_no_account: "zernio_no_account",
  late_no_auth_url: "zernio_no_auth_url",
};

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  instagram_not_configured:
    "Add ZERNIO_API_KEY for Instagram via Zernio, or INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET for Meta only.",
  zernio_profile_failed:
    "Zernio could not load your workspace. Check ZERNIO_API_KEY and optional ZERNIO_PROFILE_ID in .env.",
  zernio_not_configured: "ZERNIO_API_KEY is missing in server .env.",
  zernio_connect_failed: "Zernio could not start Instagram login. Check your API key in the Zernio dashboard.",
  zernio_fetch_accounts_failed: "Could not list accounts from Zernio (network or key).",
  zernio_no_account: "No Instagram account returned—finish connecting the channel in Zernio.",
  zernio_no_auth_url: "Zernio did not return a login URL.",
  zernio_init_failed: "Could not start Instagram via Zernio.",
};

function messageForOAuthError(code: string): string {
  const key = OAUTH_ERROR_ALIASES[code] || code;
  return OAUTH_ERROR_MESSAGES[key] || `Login failed: ${code.replace(/_/g, " ")}`;
}

async function runAIAnalysis(
  accountId: string,
  posts: { caption: string }[],
  profile: { displayName?: string; username?: string; followersCount?: number }
): Promise<{ about: string; writes: string; perception: string }> {
  const captions = posts.map((p) => p.caption).filter(Boolean);
  const res = await fetch(`/api/accounts/${accountId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      captions,
      displayName: profile.displayName ?? "",
      username: profile.username ?? "",
      followersCount: profile.followersCount,
    }),
  });
  if (!res.ok) throw new Error("Analysis failed");
  return res.json();
}

async function generateImageVariants(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 2500));
  return [
    "https://picsum.photos/seed/v1/400/400",
    "https://picsum.photos/seed/v2/400/400",
    "https://picsum.photos/seed/v3/400/400",
    "https://picsum.photos/seed/v4/400/400",
  ];
}

export default function SocialMedia() {
  const [postContent, setPostContent] = useState("");
  const { accounts, selectedAccountId, setSelectedAccountId, updateAccountAnalysis, updateAccountStats } =
    useAccounts();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ about: string; writes: string; perception: string } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [recentPosts, setRecentPosts] = useState<{
    id: string; caption: string; picture: string; permalink: string;
    mediaType: string; likeCount: number; commentCount: number; createdTime: string;
  }[]>([]);

  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  const fetchStats = useCallback((accountId: string) => {
    const account = accountsRef.current.find((a) => a.id === accountId);
    if (!account?.isOAuth) return;
    setStatsLoading(true);
    fetch(`/api/accounts/${accountId}/data`)
      .then((res) => {
        if (!res.ok) {
          console.warn(`[stats] /api/accounts/${accountId}/data responded ${res.status}`);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const stats = data.stats ?? data.profile?.stats;
        const profile = data.profile || {};
        const mediaCount =
          stats?.mediaCount ??
          (profile.media_count != null ? Number(profile.media_count) : undefined);
        const followersCount = stats?.followersCount ?? (profile.followers_count != null ? Number(profile.followers_count) : undefined);
        const followingCount = stats?.followingCount ?? (profile.follows_count != null ? Number(profile.follows_count) : undefined);
        const accountType = stats?.accountType ?? (profile.account_type as string | undefined);
        const hasAny = followersCount != null || followingCount != null || mediaCount != null;
        if (hasAny || stats?.zernioNote) {
          updateAccountStats(accountId, {
            followersCount,
            followingCount,
            mediaCount,
            accountType,
            totalLikes: stats?.totalLikes,
            totalComments: stats?.totalComments,
            avgLikes: stats?.avgLikes,
            avgComments: stats?.avgComments,
            engagementRate: stats?.engagementRate,
            updatedAt: stats?.updatedAt ?? new Date().toISOString(),
            zernioNote: stats?.zernioNote,
          });
        }
        if (Array.isArray(data.media) && data.media.length > 0) {
          setRecentPosts(data.media);
          const account = accountsRef.current.find((a) => a.id === accountId);
          const alreadyAnalyzed = account?.analysis?.about;
          if (!alreadyAnalyzed) {
            setAnalyzing(true);
            runAIAnalysis(
              accountId,
              data.media.map((p: { caption: string }) => ({ caption: p.caption })),
              {
                displayName: data.profile?.displayName as string | undefined,
                username: data.profile?.username as string | undefined,
                followersCount: data.stats?.followersCount,
              }
            )
              .then((result) => {
                setAnalysisResult(result);
                updateAccountAnalysis(accountId, { ...result, analyzedAt: new Date().toISOString() });
              })
              .catch(() => {})
              .finally(() => setAnalyzing(false));
          } else {
            setAnalysisResult({
              about: account.analysis.about ?? "",
              writes: account.analysis.writes ?? "",
              perception: account.analysis.perception ?? "",
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [updateAccountAnalysis, updateAccountStats]);

  useEffect(() => {
    if (!selectedAccountId) return;
    fetchStats(selectedAccountId);
  }, [selectedAccountId, statsRefreshKey, fetchStats]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const { oauthError, clearOauthError } = useOAuthCallback();

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
      setVariants([]);
    }
    e.target.value = "";
  }

  async function handleGenerateVariants() {
    if (!uploadedImage) return;
    setGeneratingVariants(true);
    setVariants([]);
    try {
      const urls = await generateImageVariants();
      setVariants(urls);
    } finally {
      setGeneratingVariants(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Social Media</h1>
        <p className="text-muted-foreground mt-1">Automate and manage your social media</p>
      </motion.div>

      {oauthError && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{messageForOAuthError(oauthError)}</p>
              <Button variant="ghost" size="sm" onClick={clearOauthError}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!selectedAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card className="bg-card border-border glow-border border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-2">
                Select an account in the sidebar (Connected accounts) to get started.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Use the sidebar: Instagram, TikTok, YouTube, X—or extra channels via Zernio (Facebook, WhatsApp, Google
                Business, …). See docs/KOPPLINGAR.md.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {selectedAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {(() => { const Icon = platformIcons[selectedAccount.platform]; return <Icon className="h-4 w-4 text-muted-foreground" />; })()}
              <span className="text-sm font-medium text-muted-foreground">@{selectedAccount.username}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <Sparkles className="h-3.5 w-3.5" />
              AI Analysis
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="py-5 px-6">
              {analyzing ? (
                <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Analyzing account content…</span>
                </div>
              ) : analysisResult ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">About</p>
                    <p className="text-sm leading-relaxed">{analysisResult.about}</p>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Writes about</p>
                    <p className="text-sm leading-relaxed">{analysisResult.writes}</p>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Perception</p>
                    <p className="text-sm leading-relaxed">{analysisResult.perception}</p>
                  </div>
                </div>
              ) : statsLoading ? (
                <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Fetching posts…</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No data available yet.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5" />
              AI Image Variants
            </CardTitle>
            <CardDescription>
              Upload an image and let AI generate different variants and suggestions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="flex flex-wrap gap-4 items-start">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 rounded-lg border-2 border-dashed border-border hover:border-muted-foreground/50 hover:bg-secondary/50 cursor-pointer flex items-center justify-center transition-colors"
              >
                {uploadedImage ? (
                  <img
                    src={uploadedImage}
                    alt="Uploaded"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Button
                  onClick={handleGenerateVariants}
                  disabled={!uploadedImage || generatingVariants}
                  variant="outline"
                >
                  {generatingVariants ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generatingVariants ? "Generating variants..." : "Generate AI variants"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Click the box to upload, then generate.
                </p>
              </div>
            </div>
            {variants.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Suggested variants</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {variants.map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                    >
                      <img src={url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {selectedAccount?.isOAuth && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={statsLoading}
            onClick={() => setStatsRefreshKey((k) => k + 1)}
            className="text-muted-foreground"
          >
            {statsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Loading...
              </>
            ) : (
              "Refresh stats"
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing data for {selectedAccount.username}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(        selectedAccount?.stats
          ? (() => {
              const s = selectedAccount.stats;
              const isX = selectedAccount.platform === "x";
              const isWhatsApp = selectedAccount.platform === "whatsapp";

              const avgLikesStat =
                s.avgLikes != null
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
            })()
          : defaultStats
        ).map((stat, i) => (
          <motion.div key={stat.key} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.08 }}>
            <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                  {statsLoading && selectedAccountId && i < 3 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    stat.change && <span className="text-xs text-green-400 font-medium">{stat.change}</span>
                  )}
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {selectedAccount?.stats?.zernioNote && (
        <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.12 }}>
          <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2.5 bg-muted/30 leading-relaxed">
            {selectedAccount.stats.zernioNote}
          </p>
        </motion.div>
      )}

      {recentPosts.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.25 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" />
                {selectedAccount?.platform === "whatsapp" ? "WhatsApp templates" : "Recent posts"}
              </CardTitle>
              <CardDescription>
                {selectedAccount?.platform === "whatsapp"
                  ? "Approved templates from your WhatsApp Business account (via Zernio)"
                  : "Likes and comments per post"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Image grid for visual platforms (Instagram etc.) */}
              {recentPosts[0]?.picture ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {recentPosts.map((post) => (
                    <a
                      key={post.id}
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                    >
                      <img
                        src={post.picture}
                        alt={post.caption.slice(0, 40)}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <div className="flex items-center gap-1 text-white text-xs font-semibold">
                          <Heart className="h-3.5 w-3.5 fill-white" />
                          {post.likeCount}
                        </div>
                        <div className="flex items-center gap-1 text-white text-xs">
                          <FileText className="h-3.5 w-3.5" />
                          {post.commentCount}
                        </div>
                      </div>
                      <div className="absolute bottom-1 left-1 flex gap-1">
                        <span className="bg-black/70 text-white text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5">
                          <Heart className="h-2.5 w-2.5 fill-white" />{post.likeCount}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                /* Text list for text-based platforms (X/Twitter) */
                <div className="space-y-2">
                  {recentPosts.map((post) => {
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
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div className="lg:col-span-2" {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Schedule post
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Write your post here..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                className="bg-secondary border-border min-h-[100px] resize-none"
              />
              <div className="flex gap-3">
                <Input type="date" className="bg-secondary border-border w-auto" />
                <Input type="time" className="bg-secondary border-border w-auto" />
                <Button className="glow-sm hover:glow-md transition-shadow duration-300">
                  Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border glow-border h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Content ideas
              </CardTitle>
              <CardDescription>AI-generated suggestions</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {contentIdeas.map((idea, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span className="text-muted-foreground/50 mt-0.5">→</span>
                    {idea}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="text-lg">Scheduled posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledPosts.map((post, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.time}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground">
                    {post.platform}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
