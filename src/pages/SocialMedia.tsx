import { m } from "framer-motion";
import { pageFadeUp as fadeUp } from "@/lib/motion";
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
  Film,
  FolderOpen,
  Star,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAiRecommendations } from "@/features/ai-recommendations";
import { useTasks } from "@/features/tasks";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { apiUrl } from "@/lib/apiBase";
import { useAccountData } from "@/hooks/useAccountData";
import { loadSelectedContent, type SelectedContentAsset } from "@/lib/contentSelection";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConnectionEntriesForArea } from "@/lib/connectionCatalog";
import {
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
  XIcon,
  FacebookIcon,
  GoogleBusinessIcon,
  WhatsAppIcon,
} from "@/components/platform-icons";
import type { ConnectedAccount, SocialPlatform } from "@/types/accounts";

const platformIcons: Record<SocialPlatform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  x: XIcon,
  facebook: FacebookIcon,
  google_business: GoogleBusinessIcon,
  whatsapp: WhatsAppIcon,
};

const SOCIAL_PAGE_PLATFORMS: readonly SocialPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "facebook",
  "google_business",
  "whatsapp",
];

const SOCIAL_PAGE_PLATFORM_SET = new Set<string>(SOCIAL_PAGE_PLATFORMS);
const SOCIAL_CONNECTION_ENTRIES = getConnectionEntriesForArea("social").filter((entry) =>
  SOCIAL_PAGE_PLATFORM_SET.has(entry.platform)
);

/** Instagram first, then TikTok, YouTube, etc.—matches user expectation when auto-opening a channel. */
function sortSocialPageAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const ia = SOCIAL_PAGE_PLATFORMS.indexOf(a.platform as SocialPlatform);
  const ib = SOCIAL_PAGE_PLATFORMS.indexOf(b.platform as SocialPlatform);
  const ra = ia === -1 ? 999 : ia;
  const rb = ib === -1 ? 999 : ib;
  if (ra !== rb) return ra - rb;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

const defaultStats = [
  { label: "Followers", value: "–", change: "", icon: Users, key: "followers" },
  { label: "Following", value: "–", change: "", icon: Users, key: "following" },
  { label: "Posts", value: "–", change: "", icon: FileText, key: "media" },
  { label: "Engagement", value: "–", change: "", icon: Heart, key: "engagement" },
];


type SocialMediaApiPost = {
  id: string;
  caption: string;
  picture: string;
  permalink: string;
  mediaType: string;
  likeCount: number;
  commentCount: number;
  viewCount?: number;
  createdTime: string;
};

type GoogleBusinessPanel = {
  source: "zernio" | "official";
  title?: string;
  phone?: string;
  website?: string;
  addressLines: string[];
  primaryCategory?: string;
  averageRating?: number;
  reviewCount?: number;
  reviews: Array<{
    id: string;
    author: string;
    rating?: number;
    text: string;
    createdAt: string;
    url?: string;
  }>;
};

type SocialMediaApiResponse = {
  source?: string;
  stats?: {
    followersCount?: number;
    followingCount?: number;
    mediaCount?: number;
    accountType?: string;
    totalLikes?: number;
    totalComments?: number;
    totalViews?: number;
    avgLikes?: number;
    avgComments?: number;
    avgViews?: number;
    engagementRate?: number;
    updatedAt?: string;
    zernioNote?: string;
    averageRating?: number;
    reviewCount?: number;
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
  googleBusiness?: GoogleBusinessPanel;
  reviews?: GoogleBusinessPanel["reviews"];
  zernioExtra?: Record<string, unknown>;
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
    "Zernio could not load your workspace. Check ZERNIO_API_KEY and optional ZERNIO_PROFILE_ID in .env.local.",
  zernio_not_configured: "ZERNIO_API_KEY is missing in .env.local.",
  zernio_connect_failed: "Zernio could not start Instagram login. Check your API key in the Zernio dashboard.",
  zernio_fetch_accounts_failed: "Could not list accounts from Zernio (network or key).",
  zernio_no_account: "No Instagram account returned—finish connecting the channel in Zernio.",
  zernio_no_auth_url: "Zernio did not return a login URL.",
  zernio_init_failed: "Could not start Instagram via Zernio.",
  zernio_gmb_not_supported:
    "Google Business direct connect is not enabled for this Zernio workspace yet. Use 'All Zernio channels…' and link an existing Google Business account.",
  zernio_gmb_selection_failed:
    "Google Business requires location selection in Zernio. Open 'All Zernio channels…' and complete Google Business selection there.",
  google_business_not_configured:
    "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local to connect Google Business via the official API.",
  google_business_use_official:
    "Use “Google Business via Official API” from Connect more, or link a location via Zernio.",
  google_business_accounts_api_failed: "Google could not list Business Profile accounts. Check OAuth scopes and API access.",
  google_business_locations_api_failed: "Google could not list locations for this account.",
  google_business_no_account_access: "No Google Business account access on this login.",
  google_business_no_location_access: "No Google Business location was returned. Check that a location exists in Business Profile.",
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
  const res = await fetch(apiUrl(`/api/accounts/${accountId}/analyze`), {
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

type VideoDraftResult = {
  title: string;
  hook: string;
  concept: string;
  shots: string[];
  caption: string;
  cta: string;
};

async function generateVideoDraft(payload: {
  asset: Pick<SelectedContentAsset, "id" | "name" | "mimeType" | "kind" | "webViewLink">;
  prompt: string;
  platform: string;
  objective: string;
}): Promise<{ draft: VideoDraftResult; source: string }> {
  const res = await fetch(apiUrl("/api/content/video-draft"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || "Could not generate video draft");
  }
  return res.json();
}

export default function SocialMedia() {
  const { authMode, session } = useAuth();
  const [postContent, setPostContent] = useState("");
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId, showOverview, updateAccountAnalysis, updateAccountStats } =
    useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { recommendations: aiRecs } = useAiRecommendations(businessProfileId);
  const { tasks: contentTasks } = useTasks(businessProfileId);
  const contentIdeas = useMemo(
    () => aiRecs.filter((r) => r.kind === "content" && (r.status === "new" || r.status === "seen")).slice(0, 5),
    [aiRecs]
  );
  const scheduledContentTasks = useMemo(
    () => contentTasks.filter((t) => t.module === "campaign" && t.status !== "done" && t.status !== "archived").slice(0, 5),
    [contentTasks]
  );
  const selectedAccountId = getSelectedAccountId("social-media");
  const [activeSocialTab, setActiveSocialTab] = useState<SocialPlatform>("instagram");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ about: string; writes: string; perception: string } | null>(null);
  const [recentPosts, setRecentPosts] = useState<{
    id: string; caption: string; picture: string; permalink: string;
    mediaType: string; likeCount: number; commentCount: number; viewCount?: number; createdTime: string;
  }[]>([]);

  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const [initialSocialData] = useState<SocialMediaApiResponse | null>(null);
  const {
    data: socialData,
    dataAccountId,
    loading: statsLoading,
    refresh: refreshStats,
    error,
    setError,
  } = useAccountData<SocialMediaApiResponse | null>({
    accounts,
    selectedAccountId,
    setSelectedAccountId: (id) => setSelectedAccountId("social-media", id),
    accountFilter: (a) => SOCIAL_PAGE_PLATFORM_SET.has(a.platform),
    initialData: initialSocialData,
    autoSelectFirst: !showOverview,
    allowImplicitFirstAccount: false,
    scopeSort: sortSocialPageAccounts,
    fetcher: async (accountId) => {
      let res = await fetch(apiUrl(`/api/accounts/${accountId}/data`), { credentials: "include" });
      if (res.status === 401 && authMode === "local") {
        await fetch(apiUrl("/api/auth/local-session"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
        res = await fetch(apiUrl(`/api/accounts/${accountId}/data`), { credentials: "include" });
      }
      if (res.status === 401 && authMode === "cloud" && session?.access_token) {
        await fetch(apiUrl("/api/auth/session"), {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          credentials: "include",
        }).catch(() => {});
        res = await fetch(apiUrl(`/api/accounts/${accountId}/data`), { credentials: "include" });
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
    if (!selectedAccountId || !socialData || dataAccountId !== selectedAccountId) return;
    const data = socialData;
    const stats = data.stats ?? data.profile?.stats;
    const profile = data.profile || {};
    const account = accountsRef.current.find((a) => a.id === selectedAccountId);
    const isGbp = account?.platform === "google_business";
    const gbp = data.googleBusiness;
    const mediaCount =
      stats?.mediaCount ??
      (profile.media_count != null ? Number(profile.media_count) : undefined);
    const followersCount = stats?.followersCount ?? (profile.followers_count != null ? Number(profile.followers_count) : undefined);
    const followingCount = stats?.followingCount ?? (profile.follows_count != null ? Number(profile.follows_count) : undefined);
    const accountType = stats?.accountType ?? (profile.account_type as string | undefined);
    const hasAny = followersCount != null || followingCount != null || mediaCount != null;
    if (
      isGbp &&
      (gbp || stats?.averageRating != null || stats?.reviewCount != null || stats?.zernioNote)
    ) {
      const avg = stats?.averageRating ?? gbp?.averageRating;
      const rev = stats?.reviewCount ?? gbp?.reviewCount;
      updateAccountStats(selectedAccountId, {
        averageRating: avg,
        reviewCount: rev,
        mediaCount: rev ?? mediaCount,
        updatedAt: stats?.updatedAt ?? new Date().toISOString(),
        zernioNote: stats?.zernioNote,
      });
    } else if (hasAny || stats?.zernioNote) {
      updateAccountStats(selectedAccountId, {
        followersCount,
        followingCount,
        mediaCount,
        accountType,
        totalLikes: stats?.totalLikes,
        totalComments: stats?.totalComments,
        totalViews: stats?.totalViews,
        avgLikes: stats?.avgLikes,
        avgComments: stats?.avgComments,
        avgViews: stats?.avgViews,
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
  }, [socialData, dataAccountId, selectedAccountId, updateAccountAnalysis, updateAccountStats]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoPlatform, setVideoPlatform] = useState("Instagram Reels");
  const [videoObjective, setVideoObjective] = useState("Create a short social media video");
  const [generatingVideoDraft, setGeneratingVideoDraft] = useState(false);
  const [videoDraftSource, setVideoDraftSource] = useState<string | null>(null);
  const [videoDraft, setVideoDraft] = useState<VideoDraftResult | null>(null);
  const [videoDraftError, setVideoDraftError] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<SelectedContentAsset[]>(() =>
    loadSelectedContent(activeProfileId)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socialAccounts = useMemo(() => {
    const list = accounts.filter((a) => SOCIAL_PAGE_PLATFORM_SET.has(a.platform));
    if (list.length < 2) return list;
    return [...list].sort(sortSocialPageAccounts);
  }, [accounts]);
  const selectedAccount = socialAccounts.find((a) => a.id === selectedAccountId) ?? null;
  const selectedZernioNote =
    (socialData?.stats as { zernioNote?: string } | undefined)?.zernioNote ||
    selectedAccount?.stats?.zernioNote;
  const selectedContentImages = selectedContent.filter((asset) => asset.kind === "image");
  const selectedContentVideos = selectedContent.filter((asset) => asset.kind === "video");

  useEffect(() => {
    setSelectedContent(loadSelectedContent(activeProfileId));
  }, [activeProfileId]);

  useEffect(() => {
    if (!uploadedImage && selectedContentImages.length > 0) {
      setUploadedImage(selectedContentImages[0].previewUrl || selectedContentImages[0].thumbnailUrl);
    }
  }, [uploadedImage, selectedContentImages]);

  useEffect(() => {
    if (!selectedVideoId && selectedContentVideos.length > 0) {
      setSelectedVideoId(selectedContentVideos[0].id);
    }
    if (selectedVideoId && !selectedContentVideos.some((asset) => asset.id === selectedVideoId)) {
      setSelectedVideoId(selectedContentVideos[0]?.id || null);
    }
  }, [selectedContentVideos, selectedVideoId]);

  useEffect(() => {
    setRecentPosts([]);
    setAnalysisResult(null);
    setAnalyzing(false);
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedAccount && selectedAccount.platform !== activeSocialTab) {
      setActiveSocialTab(selectedAccount.platform as SocialPlatform);
    }
  }, [activeSocialTab, selectedAccount]);

  function handleSocialTabChange(value: string) {
    const platform = value as SocialPlatform;
    setActiveSocialTab(platform);
    const nextAccount = socialAccounts.find((account) => account.platform === platform);
    setSelectedAccountId("social-media", nextAccount?.id ?? null);
  }

  useEffect(() => {
    if (!selectedAccountId) return;
    const existsInSocialAccounts = socialAccounts.some((a) => a.id === selectedAccountId);
    if (!existsInSocialAccounts) {
      setSelectedAccountId("social-media", null);
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

  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();

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

  const selectedVideoAsset =
    selectedContentVideos.find((asset) => asset.id === selectedVideoId) ?? selectedContentVideos[0] ?? null;

  async function handleGenerateVideoDraft() {
    if (!selectedVideoAsset) return;
    setGeneratingVideoDraft(true);
    setVideoDraft(null);
    setVideoDraftError(null);
    try {
      const result = await generateVideoDraft({
        asset: {
          id: selectedVideoAsset.id,
          name: selectedVideoAsset.name,
          mimeType: selectedVideoAsset.mimeType,
          kind: selectedVideoAsset.kind,
          webViewLink: selectedVideoAsset.webViewLink,
        },
        prompt: videoPrompt,
        platform: videoPlatform,
        objective: videoObjective,
      });
      setVideoDraft(result.draft);
      setVideoDraftSource(result.source);
    } catch (error) {
      setVideoDraftError(error instanceof Error ? error.message : "Could not generate video draft");
    } finally {
      setGeneratingVideoDraft(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={Sparkles}
        title="Social Media"
        description="Automate and manage your social media"
      />

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <Tabs value={activeSocialTab} onValueChange={handleSocialTabChange}>
          <div className="rounded-lg border border-border bg-card/70 p-1">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
              {SOCIAL_CONNECTION_ENTRIES.map((entry) => {
                const platform = entry.platform as SocialPlatform;
                const Icon = platformIcons[platform];
                const linkedAccounts = socialAccounts.filter((account) => account.platform === platform);
                return (
                  <TabsTrigger
                    key={entry.platform}
                    value={entry.platform}
                    className="min-w-fit gap-2 rounded-md px-3 py-2 text-xs data-[state=active]:bg-accent data-[state=active]:shadow-none"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{entry.label.replace(" Profile", "")}</span>
                    {linkedAccounts.length > 0 ? (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[10px] font-semibold text-success-foreground tabular-nums">
                        {linkedAccounts.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {SOCIAL_CONNECTION_ENTRIES.map((entry) => {
            const platform = entry.platform as SocialPlatform;
            const linkedAccounts = socialAccounts.filter((account) => account.platform === platform);
            return (
              <TabsContent key={entry.platform} value={entry.platform} className="mt-3">
                <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {entry.label}
                      </p>
                      {linkedAccounts.length > 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground truncate">
                          {linkedAccounts.map((account) => account.displayName || account.username).join(" · ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Not linked for this profile. {entry.connectSteps}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      {linkedAccounts.length > 0 ? (
                        <span className="font-medium text-success">Connected</span>
                      ) : (
                        <Link to="/connections" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                          Connect now
                        </Link>
                      )}
                      <Link to="/preferences" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                        API keys
                      </Link>
                    </div>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </m.div>

      {authMode === "local" && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Local mode is active. OAuth/connect is enabled for local testing and data stays local to your current session.
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}

      {oauthErrorDetails && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={messageForOAuthError(oauthErrorDetails.code)}
            onDismiss={clearOauthError}
          />
        </m.div>
      )}
      {error && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-destructive">Could not load social stats: {error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        </m.div>
      )}

      {!selectedAccount && showOverview && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
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
        </m.div>
      )}

      {!selectedAccount && !showOverview && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <EmptyState
            icon={Sparkles}
            title="Select a social account"
            description="Pick a connected account from the sidebar (Instagram, TikTok, YouTube, X) — or add more via Zernio (Facebook, WhatsApp, Google Business, …)."
          />
        </m.div>
      )}

      {selectedAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
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
                  <span>
                    {selectedAccount.platform === "google_business"
                      ? "Fetching Business Profile…"
                      : "Fetching posts…"}
                  </span>
                </div>
              ) : selectedZernioNote ? (
                <p className="text-sm text-muted-foreground py-2">{selectedZernioNote}</p>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No data available yet.</p>
              )}
            </CardContent>
          </Card>
        </m.div>
      )}

      {selectedAccount?.platform === "google_business" &&
        socialData &&
        dataAccountId === selectedAccountId && (
          <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.12 }}>
            <Card className="bg-card border-border glow-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GoogleBusinessIcon className="h-5 w-5" />
                  Google Business Profile
                </CardTitle>
                <CardDescription>
                  {socialData.googleBusiness?.source === "official"
                    ? "Data from Google Business Profile APIs."
                    : "Data from your linked Zernio account (location + reviews when available)."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {statsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    Loading profile…
                  </div>
                ) : socialData.googleBusiness ? (
                  <>
                    <div className="space-y-2 text-sm">
                      {socialData.googleBusiness.title ? (
                        <p className="font-medium text-foreground">{socialData.googleBusiness.title}</p>
                      ) : null}
                      {socialData.googleBusiness.primaryCategory ? (
                        <p className="text-muted-foreground">{socialData.googleBusiness.primaryCategory}</p>
                      ) : null}
                      {socialData.googleBusiness.addressLines.length > 0 ? (
                        <p className="flex gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{socialData.googleBusiness.addressLines.join(", ")}</span>
                        </p>
                      ) : null}
                      {socialData.googleBusiness.phone ? (
                        <p className="text-muted-foreground">{socialData.googleBusiness.phone}</p>
                      ) : null}
                      {socialData.googleBusiness.website ? (
                        <a
                          href={
                            socialData.googleBusiness.website.startsWith("http")
                              ? socialData.googleBusiness.website
                              : `https://${socialData.googleBusiness.website}`
                          }
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {socialData.googleBusiness.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : null}
                    </div>
                    {socialData.googleBusiness.reviews.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Recent reviews
                        </p>
                        <ul className="space-y-3 max-h-72 overflow-y-auto pr-1">
                          {socialData.googleBusiness.reviews.map((r) => (
                            <li key={r.id} className="rounded-md border border-border/80 p-3 text-sm">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-medium">{r.author}</span>
                                {r.rating != null && r.rating > 0 ? (
                                  <span className="text-xs text-muted-foreground">{r.rating.toFixed(1)} ★</span>
                                ) : null}
                              </div>
                              {r.text ? <p className="text-muted-foreground leading-relaxed">{r.text}</p> : null}
                              {r.createdAt ? (
                                <p className="text-[11px] text-muted-foreground/80 mt-1">{r.createdAt}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No location or review details returned yet. For Zernio, confirm GBP add-ons; for the official API,
                    reconnect under Connect more → Google Business via Official API.
                  </p>
                )}
              </CardContent>
            </Card>
          </m.div>
        )}

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="h-5 w-5" />
              Selected content from Google Drive
            </CardTitle>
            <CardDescription>
              Mark files in the Content tab and use selected images or videos here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedContent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Google Drive files marked yet. Open the Content tab and mark the media you want to use.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{selectedContentImages.length} image{selectedContentImages.length === 1 ? "" : "s"}</span>
                  <span>{selectedContentVideos.length} video{selectedContentVideos.length === 1 ? "" : "s"}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {selectedContent.map((asset) => (
                    <div key={asset.id} className="rounded-lg border border-border overflow-hidden bg-secondary/20">
                      <div className="aspect-square bg-secondary/50 flex items-center justify-center overflow-hidden">
                        {asset.thumbnailUrl ? (
                          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
                        ) : asset.kind === "video" ? (
                          <Film className="h-6 w-6 text-muted-foreground" />
                        ) : (
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="p-2 space-y-2">
                        <p className="text-xs font-medium truncate">{asset.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {asset.kind === "image" && (asset.previewUrl || asset.thumbnailUrl) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                setUploadedImage(asset.previewUrl || asset.thumbnailUrl);
                                setVariants([]);
                              }}
                            >
                              Use as source
                            </Button>
                          )}
                          {asset.webViewLink && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" asChild>
                              <a href={asset.webViewLink} target="_blank" rel="noopener noreferrer">Open</a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedContentVideos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Video files can now be used to generate a video brief and caption draft below.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.16 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Film className="h-5 w-5" />
              AI Video Draft
            </CardTitle>
            <CardDescription>
              Choose a selected Google Drive video and generate a reusable short-form video concept, shot list, and caption.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedContentVideos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No selected Google Drive videos yet. Mark one in the Content tab to generate a video draft here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Source video</p>
                    <div className="space-y-2">
                      {selectedContentVideos.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setSelectedVideoId(asset.id)}
                          className={`w-full text-left rounded-lg border p-3 transition-colors ${
                            selectedVideoAsset?.id === asset.id
                              ? "border-primary bg-primary/5"
                              : "border-border bg-secondary/20 hover:bg-secondary/40"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-md overflow-hidden bg-secondary/60 flex items-center justify-center shrink-0">
                              {asset.thumbnailUrl ? (
                                <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
                              ) : (
                                <Film className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{asset.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{asset.mimeType || "video/*"}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="video-platform">Platform</Label>
                        <Input
                          id="video-platform"
                          value={videoPlatform}
                          onChange={(e) => setVideoPlatform(e.target.value)}
                          placeholder="Instagram Reels"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="video-objective">Objective</Label>
                        <Input
                          id="video-objective"
                          value={videoObjective}
                          onChange={(e) => setVideoObjective(e.target.value)}
                          placeholder="Create a short product teaser"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="video-prompt">Extra direction</Label>
                      <Textarea
                        id="video-prompt"
                        value={videoPrompt}
                        onChange={(e) => setVideoPrompt(e.target.value)}
                        placeholder="Hook angle, target audience, CTA, brand tone, or key points to highlight."
                        className="bg-secondary border-border min-h-[96px] resize-none"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button onClick={() => void handleGenerateVideoDraft()} disabled={!selectedVideoAsset || generatingVideoDraft}>
                        {generatingVideoDraft ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Film className="h-4 w-4 mr-2" />
                        )}
                        {generatingVideoDraft ? "Generating..." : "Generate video draft"}
                      </Button>
                      {selectedVideoAsset?.webViewLink && (
                        <Button variant="outline" asChild>
                          <a href={selectedVideoAsset.webViewLink} target="_blank" rel="noopener noreferrer">Open source video</a>
                        </Button>
                      )}
                    </div>
                    {videoDraftError && (
                      <p className="text-sm text-destructive">{videoDraftError}</p>
                    )}
                  </div>
                </div>

                {videoDraft && (
                  <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                        {videoDraftSource === "openai" ? "AI-generated" : "Fallback draft"}
                      </span>
                      <span>Built from {selectedVideoAsset?.name}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</p>
                      <p className="text-sm">{videoDraft.title}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Hook</p>
                      <p className="text-sm">{videoDraft.hook}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Concept</p>
                      <p className="text-sm">{videoDraft.concept}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shot list</p>
                      <div className="space-y-2">
                        {videoDraft.shots.map((shot, index) => (
                          <div key={`${shot}-${index}`} className="rounded-md border border-border/70 bg-background/80 p-3">
                            <p className="text-sm">{shot}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Caption</p>
                        <p className="text-sm">{videoDraft.caption}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">CTA</p>
                        <p className="text-sm">{videoDraft.cta}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.18 }}>
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
                  Click the box to upload, or use a selected Google Drive image above, then generate.
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
      </m.div>

      {selectedAccount && (selectedAccount.isOAuth || selectedAccount.isZernio) && (
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
              const isGbp = selectedAccount.platform === "google_business";
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
                  {
                    ...defaultStats[2],
                    key: "gbp-posts",
                    label: "Posts",
                    value: "–",
                  },
                  {
                    ...defaultStats[3],
                    key: "gbp-engagement",
                    label: "Engagement",
                    value: "–",
                  },
                ];
              }
              const isX = selectedAccount.platform === "x";
              const isWhatsApp = selectedAccount.platform === "whatsapp";
              const isInstagram = selectedAccount.platform === "instagram";

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
            })()
          : defaultStats
        ).map((stat, i) => (
          <m.div key={stat.key} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.08 }}>
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
          </m.div>
        ))}
      </div>

      {selectedAccount?.stats?.zernioNote && (
        <m.div {...fadeUp} transition={{ duration: 0.3, delay: 0.12 }}>
          <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2.5 bg-muted/30 leading-relaxed">
            {selectedAccount.stats.zernioNote}
          </p>
        </m.div>
      )}

      {recentPosts.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.25 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" />
                {selectedAccount?.platform === "whatsapp" ? "WhatsApp templates" : "Recent posts"}
              </CardTitle>
              <CardDescription>
                {selectedAccount?.platform === "whatsapp"
                  ? "Approved templates from your WhatsApp Business account (via Zernio)"
                  : selectedAccount?.platform === "instagram"
                    ? "Views, likes and comments per post"
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
                        {selectedAccount?.platform === "instagram" && (
                          <div className="flex items-center gap-1 text-white text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            {numberFmt.format(post.viewCount ?? 0)}
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
                        {selectedAccount?.platform === "instagram" && (
                          <span className="bg-black/70 text-white text-[11px] px-1 py-0.5 rounded flex items-center gap-0.5">
                            <Eye className="h-2.5 w-2.5" />{numberFmt.format(post.viewCount ?? 0)}
                          </span>
                        )}
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
                          {selectedAccount?.platform === "instagram" && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" />
                              {numberFmt.format(post.viewCount ?? 0)}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <m.div className="lg:col-span-2" {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
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
        </m.div>

        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border glow-border h-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5" />
                    Innehållsidéer
                  </CardTitle>
                  <CardDescription>AI-genererade förslag</CardDescription>
                </div>
                <Link to="/ai-recommendations" className="text-xs text-primary hover:underline">
                  Alla →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {contentIdeas.length === 0 ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm text-muted-foreground">Inga AI-förslag ännu.</p>
                  <Link to="/ai-recommendations">
                    <Button size="sm" variant="outline" className="text-xs">
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Generera förslag
                    </Button>
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {contentIdeas.map((rec) => (
                    <li
                      key={rec.id}
                      className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="text-muted-foreground/50 mt-0.5">→</span>
                      <span>{rec.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </m.div>
      </div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">Aktiva kampanjer</CardTitle>
              <Link to="/sales-marketing" className="text-xs text-primary hover:underline">
                Hantera →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {scheduledContentTasks.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-foreground">Inga aktiva kampanjer.</p>
                <Link to="/sales-marketing">
                  <Button size="sm" variant="outline" className="text-xs">
                    Skapa kampanj
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledContentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.due_at && (
                        <p className="text-xs text-muted-foreground">
                          Deadline: {new Date(task.due_at).toLocaleDateString("sv-SE")}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground shrink-0 ${
                      task.status === "in_progress" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : ""
                    }`}>
                      {task.status === "open" ? "Planerad" : task.status === "in_progress" ? "Aktiv" : "Pausad"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
}
