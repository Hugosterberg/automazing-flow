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
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccountData } from "@/hooks/useAccountData";
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

type SocialMediaApiPost = {
  id: string;
  caption: string;
  picture: string;
  permalink: string;
  mediaType: string;
  likeCount: number;
  commentCount: number;
  createdTime: string;
};

type SocialMediaApiResponse = {
  stats?: {
    followersCount?: number;
    followingCount?: number;
    mediaCount?: number;
    accountType?: string;
    totalLikes?: number;
    totalComments?: number;
    avgLikes?: number;
    avgComments?: number;
    engagementRate?: number;
    updatedAt?: string;
    zernioNote?: string;
  };
  profile?: {
    displayName?: string;
    username?: string;
    media_count?: number;
    followers_count?: number;
    follows_count?: number;
    account_type?: string;
    stats?: SocialMediaApiResponse["stats"];
  };
  media?: SocialMediaApiPost[];
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
  zernio_gmb_not_supported:
    "Google Business direct connect is not enabled for this Zernio workspace yet. Use 'All Zernio channels…' and link an existing Google Business account.",
  zernio_gmb_selection_failed:
    "Google Business requires location selection in Zernio. Open 'All Zernio channels…' and complete Google Business selection there.",
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
    credentials: "include",
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
  const { authMode, session } = useAuth();
  const [postContent, setPostContent] = useState("");
  const { accounts, selectedAccountId, setSelectedAccountId, showOverview, updateAccountAnalysis, updateAccountStats } =
    useAccounts();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ about: string; writes: string; perception: string } | null>(null);
  const [recentPosts, setRecentPosts] = useState<{
    id: string; caption: string; picture: string; permalink: string;
    mediaType: string; likeCount: number; commentCount: number; createdTime: string;
  }[]>([]);

  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const [initialSocialData] = useState<SocialMediaApiResponse | null>(null);
  const {
    data: socialData,
    loading: statsLoading,
    refresh: refreshStats,
    error,
    setError,
  } = useAccountData<SocialMediaApiResponse | null>({
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    accountFilter: (a) => a.id === selectedAccountId,
    initialData: initialSocialData,
    autoSelectFirst: false,
    fetcher: async (accountId) => {
      let res = await fetch(`/api/accounts/${accountId}/data`, { credentials: "include" });
      if (res.status === 401 && authMode === "local") {
        await fetch("/api/auth/local-session", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
        res = await fetch(`/api/accounts/${accountId}/data`, { credentials: "include" });
      }
      if (res.status === 401 && authMode === "cloud" && session?.access_token) {
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          credentials: "include",
        }).catch(() => {});
        res = await fetch(`/api/accounts/${accountId}/data`, { credentials: "include" });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          typeof d?.error === "string" && d.error.trim().length > 0
            ? d.error
            : `Could not fetch account stats (${res.status})`
        );
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (!selectedAccountId || !socialData) return;
    const data = socialData;
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
      updateAccountStats(selectedAccountId, {
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
      const account = accountsRef.current.find((a) => a.id === selectedAccountId);
      const alreadyAnalyzed = account?.analysis?.about;
      if (!alreadyAnalyzed) {
        setAnalyzing(true);
        runAIAnalysis(
          selectedAccountId,
          data.media.map((p: { caption: string }) => ({ caption: p.caption })),
          {
            displayName: data.profile?.displayName as string | undefined,
            username: data.profile?.username as string | undefined,
            followersCount: data.stats?.followersCount,
          }
        )
          .then((result) => {
            setAnalysisResult(result);
            updateAccountAnalysis(selectedAccountId, { ...result, analyzedAt: new Date().toISOString() });
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
  }, [socialData, selectedAccountId, updateAccountAnalysis, updateAccountStats]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socialPlatforms = ["instagram", "tiktok", "youtube", "x", "facebook", "google_business", "whatsapp"] as const;
  const socialAccounts = useMemo(
    () => accounts.filter((a) => (socialPlatforms as readonly string[]).includes(a.platform)),
    [accounts]
  );
  const selectedAccount = socialAccounts.find((a) => a.id === selectedAccountId) ?? null;
  const selectedZernioNote =
    (socialData?.stats as { zernioNote?: string } | undefined)?.zernioNote ||
    selectedAccount?.stats?.zernioNote;

  useEffect(() => {
    if (!selectedAccountId) return;
    const existsInSocialAccounts = socialAccounts.some((a) => a.id === selectedAccountId);
    if (!existsInSocialAccounts) {
      setSelectedAccountId(null);
    }
  }, [selectedAccountId, socialAccounts, setSelectedAccountId]);

  const numberFmt = useMemo(() => new Intl.NumberFormat("en-US"), []);

  const overviewData = useMemo(() => {
    const summary = socialAccounts.reduce(
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

    const byPlatform = socialAccounts.reduce<Record<string, { accounts: number; followers: number; posts: number }>>(
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
  }, [socialAccounts]);

  useEffect(() => {
    if (!showOverview || selectedAccount) return;
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-fix',hypothesisId:'H4',location:'SocialMedia:overview-render',message:'Inline overview rendered in main panel',data:{showOverview,selectedAccountId,connected:overviewData.connected},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [showOverview, selectedAccount, selectedAccountId, overviewData.connected]);

  useEffect(() => {
    if (!selectedAccount) return;
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-fix',hypothesisId:'H5',location:'SocialMedia:account-render',message:'Account detail rendered in main panel',data:{selectedAccountId,platform:selectedAccount.platform},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [selectedAccount, selectedAccountId]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-fix',hypothesisId:'H7',location:'SocialMedia:mount',message:'SocialMedia mounted - logging self test',data:{showOverview,selectedAccountId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [showOverview, selectedAccountId]);

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

      {authMode === "local" && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Local mode is active. OAuth/connect is enabled for local testing and data stays local to your current session.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
      {error && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-destructive">Could not load social stats: {error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!selectedAccount && showOverview && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
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
        </motion.div>
      )}

      {!selectedAccount && !showOverview && (
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
              ) : selectedZernioNote ? (
                <p className="text-sm text-muted-foreground py-2">{selectedZernioNote}</p>
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
            onClick={() => void refreshStats()}
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
