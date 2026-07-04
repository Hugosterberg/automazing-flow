import { m } from "framer-motion";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import {
  Sparkles,
  ImagePlus,
  Loader2,
  Film,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAiRecommendations } from "@/features/ai-recommendations";
import { useTasks } from "@/features/tasks";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { ContentIdeasCard } from "@/features/content/ContentIdeasCard";
import { PublishComposer } from "@/features/content/PublishComposer";
import { PublishSafetyPanel } from "@/features/content/PublishSafetyPanel";
import { publishBlockReason, type PublishReadiness } from "@/features/content/apiaiResultInsights";
import { absoluteMediaUrl, publishMediaUrlsFromAssets } from "@/features/content/contentPublishMedia";
import { useGeneratedContentHistory } from "@/features/content/useGeneratedContentHistory";
import {
  SocialAutomationPanel,
  ScheduledPostsList,
  useScheduledPosts,
  GoogleBusinessCard,
  SocialVideoDraftCard,
  SocialStatsSection,
  SocialOverviewCard,
  type ScheduledPost,
  type SocialMediaApiPost,
  type SocialMediaApiResponse,
} from "@/features/social";
import { apiUrl } from "@/lib/apiBase";
import { toast } from "sonner";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useAccountData } from "@/hooks/useAccountData";
import { loadSelectedContent, type SelectedContentAsset } from "@/lib/contentSelection";
import { useProfileDocument } from "@/features/profile-documents";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
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
import { exportCanvaImage, generateSocialImage, normalizeCanvaDesignId } from "@/features/content/contentMediaClient";
import { accountDataUrl } from "@/lib/accountDataUrl";

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
  profile: { displayName?: string; username?: string; followersCount?: number },
  businessProfileId: string | null
): Promise<{ about: string; writes: string; perception: string }> {
  const captions = posts.map((p) => p.caption).filter(Boolean);
  const res = await fetchWithTimeout(apiUrl(`/api/accounts/${accountId}/analyze`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      captions,
      displayName: profile.displayName ?? "",
      username: profile.username ?? "",
      followersCount: profile.followersCount,
      business_profile_id: businessProfileId,
    }),
  });
  if (!res.ok) throw new Error("Analysis failed");
  return res.json();
}

export default function SocialMedia() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authMode, session } = useAuth();
  const [postContent, setPostContent] = useState("");
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const { posts: pipelinePosts } = useScheduledPosts();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId, showOverview, updateAccountAnalysis, updateAccountStats } =
    useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { recommendations: aiRecs } = useAiRecommendations(businessProfileId);
  const { tasks: contentTasks } = useTasks(businessProfileId);
  const { profiles: bizProfiles } = useBusinessProfiles();
  const activeBizProfile = bizProfiles.find((p) => p.id === businessProfileId);
  const contentIdeasContext = {
    businessName: activeBizProfile?.name,
    description: activeBizProfile?.notes ?? undefined,
    platform: "social media",
  };
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
  const [recentPosts, setRecentPosts] = useState<SocialMediaApiPost[]>([]);

  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);
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
    requestKey: businessProfileId,
    scopeSort: sortSocialPageAccounts,
    fetcher: async (accountId) => {
      const url = accountDataUrl(accountId, businessProfileId);
      let res = await fetchWithTimeout(url, { credentials: "include" });
      if (res.status === 401 && authMode === "local") {
        await fetchWithTimeout(apiUrl("/api/auth/local-session"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
        res = await fetchWithTimeout(url, { credentials: "include" });
      }
      if (res.status === 401 && authMode === "cloud" && session?.access_token) {
        await fetchWithTimeout(apiUrl("/api/auth/session"), {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          credentials: "include",
        }).catch(() => {});
        res = await fetchWithTimeout(url, { credentials: "include" });
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
          },
          businessProfileId
        )
          .then((result) => {
            setAnalysisResult(result);
            updateAccountAnalysis(selectedAccountId, { ...result, analyzedAt: new Date().toISOString() });
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : "Account analysis failed.");
          })
          .finally(() => setAnalyzing(false));
      } else {
        setAnalysisResult({
          about: account.analysis.about ?? "",
          writes: account.analysis.writes ?? "",
          perception: account.analysis.perception ?? "",
        });
      }
    }
  }, [businessProfileId, socialData, dataAccountId, selectedAccountId, updateAccountAnalysis, updateAccountStats]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatedMediaUrl, setGeneratedMediaUrl] = useState<string | null>(null);
  const [imageWorkflowError, setImageWorkflowError] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<"openai" | "canva" | null>(null);
  const [canvaDesignId, setCanvaDesignId] = useState("");
  const [exportingCanva, setExportingCanva] = useState(false);
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness | null>(null);
  // Read the shared content selection from the DB (synced across devices/pages).
  const selectedContent = useProfileDocument<SelectedContentAsset[]>("content-selection", [], {
    legacyRead: () => {
      const v = loadSelectedContent(activeProfileId);
      return v.length ? v : undefined;
    },
  }).data;
  const { record } = useGeneratedContentHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvaInputRef = useRef<HTMLInputElement>(null);

  const socialAccounts = useMemo(() => {
    const list = accounts.filter((a) => SOCIAL_PAGE_PLATFORM_SET.has(a.platform));
    if (list.length < 2) return list;
    return [...list].sort(sortSocialPageAccounts);
  }, [accounts]);
  const selectedAccount = socialAccounts.find((a) => a.id === selectedAccountId) ?? null;
  const canvaConnected = useMemo(
    () =>
      accounts.some(
        (account) =>
          account.platform === "canva" &&
          !account.disconnectedAt &&
          (!businessProfileId || account.profileId === businessProfileId)
      ),
    [accounts, businessProfileId]
  );
  const selectedZernioNote =
    (socialData?.stats as { zernioNote?: string } | undefined)?.zernioNote ||
    selectedAccount?.stats?.zernioNote;
  const selectedContentImages = selectedContent.filter((asset) => asset.kind === "image");
  const selectedContentVideos = selectedContent.filter((asset) => asset.kind === "video");


  useEffect(() => {
    if (!uploadedImage && selectedContentImages.length > 0) {
      const url = absoluteMediaUrl(selectedContentImages[0].previewUrl || selectedContentImages[0].thumbnailUrl);
      if (url) setUploadedImage(url);
    }
  }, [uploadedImage, selectedContentImages]);

  const composerMediaUrls = useMemo(() => {
    if (generatedMediaUrl) {
      const abs = absoluteMediaUrl(generatedMediaUrl);
      return abs ? [abs] : [];
    }
    if (uploadedImage) {
      const abs = absoluteMediaUrl(uploadedImage);
      if (abs && !abs.startsWith("blob:")) return [abs];
    }
    return publishMediaUrlsFromAssets(selectedContent);
  }, [generatedMediaUrl, uploadedImage, selectedContent]);

  const safetyImageAssets = useMemo(() => {
    const assets = [...selectedContentImages];
    if (generatedMediaUrl) {
      const url = absoluteMediaUrl(generatedMediaUrl);
      if (url && !url.startsWith("blob:")) {
        assets.unshift({
          id: "social-generated",
          name: "generated.png",
          mimeType: "image/png",
          kind: "image",
          thumbnailUrl: url,
          previewUrl: url,
          sourceAccountId: imageSource || "openai",
          sourceAccountName: imageSource === "canva" ? "Canva" : "OpenAI",
        });
      }
    }
    return assets;
  }, [selectedContentImages, generatedMediaUrl, imageSource]);

  const publishBlockedReason = publishBlockReason(publishReadiness);

  const ensureBackendSession = useCallback(async () => {
    if (authMode === "local") {
      await fetchWithTimeout(apiUrl("/api/auth/local-session"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
      return;
    }
    if (authMode === "cloud" && session?.access_token) {
      await fetchWithTimeout(apiUrl("/api/auth/session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "include",
      }).catch(() => {});
    }
  }, [authMode, session?.access_token]);

  useEffect(() => {
    setRecentPosts([]);
    setAnalysisResult(null);
    setAnalyzing(false);
  }, [selectedAccountId]);

  // Deep link from the Calendar: /social-media?post=<id> opens that pipeline
  // post in the composer. The param is consumed so refresh doesn't re-open it.
  useEffect(() => {
    const postId = searchParams.get("post");
    if (!postId) return;
    const post = pipelinePosts.find((p) => p.id === postId);
    if (!post) return;
    setEditingPost(post);
    const next = new URLSearchParams(searchParams);
    next.delete("post");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, pipelinePosts]);

  useEffect(() => {
    if (searchParams.get("create") !== "canva") return;
    const timeout = window.setTimeout(() => {
      canvaInputRef.current?.focus();
      canvaInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

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

  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
      setGeneratedMediaUrl(null);
      setImageSource(null);
      setVariants([]);
    }
    e.target.value = "";
  }

  async function handleGenerateSocialImage() {
    const prompt = imagePrompt.trim() || postContent.trim();
    if (!prompt) {
      setImageWorkflowError("Describe the image or write a caption first.");
      return;
    }
    setGeneratingVariants(true);
    setImageWorkflowError(null);
    try {
      const result = await generateSocialImage({
        prompt,
        caption: postContent,
        businessProfileId,
      });
      setUploadedImage(result.previewUrl || result.url);
      setGeneratedMediaUrl(result.url);
      setVariants([result.previewUrl || result.url]);
      setImageSource("openai");
      record({
        name: "ai-generated.png",
        mimeType: "image/png",
        kind: "image",
        mediaUrl: result.url,
        thumbnailUrl: result.previewUrl || result.url,
        source: "openai",
        sourceLabel: "OpenAI",
      });
    } catch (error) {
      setImageWorkflowError(error instanceof Error ? error.message : "Could not generate image");
    } finally {
      setGeneratingVariants(false);
    }
  }

  async function handleExportCanvaDesign() {
    const designId = normalizeCanvaDesignId(canvaDesignId);
    if (!designId) {
      setImageWorkflowError("Paste a Canva design link or ID first.");
      return;
    }
    setExportingCanva(true);
    setImageWorkflowError(null);
    try {
      const result = await exportCanvaImage({
        designId,
        businessProfileId,
      });
      setUploadedImage(result.url);
      setGeneratedMediaUrl(result.url);
      setVariants([result.url]);
      setImageSource("canva");
      record({
        name: "canva-export.png",
        mimeType: "image/png",
        kind: "image",
        mediaUrl: result.url,
        thumbnailUrl: result.url,
        source: "canva",
        sourceLabel: "Canva",
      });
    } catch (error) {
      setImageWorkflowError(error instanceof Error ? error.message : "Could not export Canva design");
    } finally {
      setExportingCanva(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={Sparkles}
        title="Social Media"
        description="Automate and manage your social media"
      />

      <m.div {...fadeUp} transition={{ duration: 0.3 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.social}
          title="MCP design assist"
          description="Creative briefs and design direction via Canva MCP for social content."
        />
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.3 }}>
        <ContentIdeasCard
          businessProfileId={businessProfileId}
          context={contentIdeasContext}
          onUseIdea={setPostContent}
        />
      </m.div>

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
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => void refreshStats()}>
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {!selectedAccount && showOverview && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <SocialOverviewCard accounts={socialAccounts} />
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
            <GoogleBusinessCard panel={socialData.googleBusiness} loading={statsLoading} />
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
                        <ImageWithFallback
                          src={asset.thumbnailUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          fallback={
                            asset.kind === "video" ? (
                              <Film className="h-6 w-6 text-muted-foreground" />
                            ) : (
                              <ImagePlus className="h-6 w-6 text-muted-foreground" />
                            )
                          }
                        />
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
        <SocialVideoDraftCard videos={selectedContentVideos} />
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.18 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5" />
              Create post image
            </CardTitle>
            <CardDescription>
              Generate an image with AI or export a Canva design, then publish it with your post. For batch tools and apiai.me transforms, use{" "}
              <Link to="/content?tab=create" className="text-primary hover:underline">
                Content → Create
              </Link>
              . All generations are saved under{" "}
              <Link to="/content?tab=history" className="text-primary hover:underline">
                Content → History
              </Link>
              .
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
                role="button"
                tabIndex={0}
                aria-label="Ladda upp bild"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className="w-32 h-32 rounded-lg border-2 border-dashed border-border hover:border-muted-foreground/50 hover:bg-secondary/50 cursor-pointer flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                <div className="space-y-2">
                  <Label htmlFor="social-image-prompt">AI image prompt</Label>
                  <Textarea
                    id="social-image-prompt"
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    placeholder="Describe the image you want for this post..."
                    className="min-h-[80px]"
                  />
                </div>
                <Button
                  onClick={() => void handleGenerateSocialImage()}
                  disabled={generatingVariants}
                  variant="outline"
                >
                  {generatingVariants ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generatingVariants ? "Generating image..." : "Generate with AI"}
                </Button>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    ref={canvaInputRef}
                    value={canvaDesignId}
                    onChange={(event) => setCanvaDesignId(event.target.value)}
                    placeholder="Canva design link or ID"
                  />
                  <Button type="button" variant="outline" onClick={() => void handleExportCanvaDesign()} disabled={exportingCanva}>
                    {exportingCanva ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    Export Canva
                  </Button>
                </div>
                {!canvaConnected ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <span>Canva is not connected with OAuth for this profile.</span>
                    <Button variant="link" size="sm" className="h-auto px-0 py-0 text-xs" asChild>
                      <Link to="/connections">Connect Canva</Link>
                    </Button>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">Uploaded local images can be previewed here, but AI/Canva images are the ones published automatically.</p>
              </div>
            </div>
            {imageWorkflowError && (
              <p className="text-sm text-destructive">{imageWorkflowError}</p>
            )}
            {generatedMediaUrl && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Ready to publish{imageSource ? ` from ${imageSource === "canva" ? "Canva" : "AI"}` : ""}.
                </p>
              </div>
            )}
            {variants.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Generated media</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {variants.map((url, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setUploadedImage(url)}
                      className="aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                    >
                      <img src={url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
        {safetyImageAssets.length > 0 ? (
          <div className="mb-4">
            <PublishSafetyPanel
              businessProfileId={businessProfileId}
              imageAssets={safetyImageAssets}
              readiness={publishReadiness}
              onReadinessChange={setPublishReadiness}
              onBeforeRequest={ensureBackendSession}
            />
          </div>
        ) : null}
        <PublishComposer
          initialCaption={postContent}
          mediaUrls={composerMediaUrls}
          onCaptionChange={setPostContent}
          editingPost={editingPost}
          onEditingPostChange={setEditingPost}
          publishBlockedReason={publishBlockedReason}
          publishWarning={
            publishReadiness && !publishReadiness.ok && publishReadiness.severity === "warn"
              ? publishReadiness.detail || publishReadiness.label
              : null
          }
          onPublished={() => {
            setGeneratedMediaUrl(null);
            setVariants([]);
            setImageSource(null);
            setPublishReadiness(null);
          }}
        />
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.22 }}>
        <ScheduledPostsList onEdit={setEditingPost} />
      </m.div>

      <SocialAutomationPanel />

      <SocialStatsSection
        account={selectedAccount}
        loading={statsLoading}
        onRefresh={() => void refreshStats()}
        posts={recentPosts}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <Link to="/marketing" className="text-xs text-primary hover:underline">
                Hantera →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {scheduledContentTasks.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-foreground">Inga aktiva kampanjer.</p>
                  <Link to="/marketing">
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
