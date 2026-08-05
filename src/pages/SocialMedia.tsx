import { m } from "framer-motion";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import {
  Sparkles,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
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
  InstagramDriveQueueCard,
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
import { AutomationEnableHint } from "@/features/automation";
import { apiUrl } from "@/lib/apiBase";
import { formatShortDate } from "@/lib/format";
import { toast } from "sonner";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useAccountData } from "@/hooks/useAccountData";
import { SelectedContentPanel } from "@/features/content/SelectedContentPanel";
import { loadSelectedContent, assetSelectionKey, saveSelectedContent, type SelectedContentAsset } from "@/lib/contentSelection";
import { useProfileDocument } from "@/features/profile-documents";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { catalogConnectSteps, getConnectionEntriesForArea } from "@/lib/connectionCatalog";
import { t as globalT } from "@/lib/i18n";
import {
  aggregateStatus,
  ConnectionStatusBadge,
  useConnections,
} from "@/features/connections";
import type { ConnectionStatus } from "@/features/connections";
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
import { ContentAiImageCard } from "@/features/content/ContentAiImageCard";
import { uploadContentMedia } from "@/features/content/contentMediaClient";
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
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";

const OAUTH_ERROR_ALIASES: Record<string, string> = {
  late_profile_failed: "zernio_profile_failed",
  late_not_configured: "zernio_not_configured",
  late_connect_failed: "zernio_connect_failed",
  late_fetch_accounts_failed: "zernio_fetch_failed",
  late_no_account: "zernio_connect_failed",
  late_no_auth_url: "zernio_no_auth_url",
};

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
  const { t } = useTranslation("social");
  const [searchParams, setSearchParams] = useSearchParams();
  const { authMode, session } = useAuth();
  const [postContent, setPostContent] = useState("");
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const { posts: pipelinePosts } = useScheduledPosts();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId, showOverview, updateAccountAnalysis, updateAccountStats } =
    useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { connections } = useConnections(businessProfileId);
  const { tasks: contentTasks } = useTasks(businessProfileId);
  const { profiles: bizProfiles } = useBusinessProfiles();
  const activeBizProfile = bizProfiles.find((p) => p.id === businessProfileId);
  const contentIdeasContext = {
    businessName: activeBizProfile?.name,
    description: activeBizProfile?.notes ?? undefined,
    platform: "social media",
  };
  const scheduledContentTasks = useMemo(
    () => contentTasks.filter((t) => t.module === "campaign" && t.status !== "done" && t.status !== "archived").slice(0, 5),
    [contentTasks]
  );

  type SocialMode = "publish" | "stats" | "more";
  const rawSocialMode = searchParams.get("tab");
  const socialMode: SocialMode =
    rawSocialMode === "stats" || rawSocialMode === "more" ? rawSocialMode : "publish";

  function setSocialMode(mode: SocialMode) {
    const next = new URLSearchParams(searchParams);
    if (mode === "publish") next.delete("tab");
    else next.set("tab", mode);
    setSearchParams(next, { replace: true });
  }

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
            : globalT("social:stats.fetchError", { status: res.status })
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
            toast.error(err instanceof Error ? err.message : t("toasts.analysisFailed"));
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
  const [generatedMediaUrl, setGeneratedMediaUrl] = useState<string | null>(null);
  const [singleMediaUrl, setSingleMediaUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<"openai" | "canva" | null>(null);
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness | null>(null);
  const selectionDoc = useProfileDocument<SelectedContentAsset[]>("content-selection", [], {
    legacyRead: () => {
      const v = loadSelectedContent(activeProfileId);
      return v.length ? v : undefined;
    },
    legacyWrite: (_bpId, value) => saveSelectedContent(activeProfileId, value),
  });
  const selectedContent = selectionDoc.data;
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

  function saveAssetSelection(asset: SelectedContentAsset, checked: boolean) {
    const key = assetSelectionKey(asset);
    const next = checked
      ? [...selectedContent.filter((existing) => assetSelectionKey(existing) !== key), asset]
      : selectedContent.filter((existing) => assetSelectionKey(existing) !== key);
    selectionDoc.save(next);
  }

  function removeFromSelected(asset: SelectedContentAsset) {
    saveAssetSelection(asset, false);
  }

  function removeManyFromSelected(assets: SelectedContentAsset[]) {
    const keys = new Set(assets.map((asset) => assetSelectionKey(asset)));
    selectionDoc.save(selectedContent.filter((asset) => !keys.has(assetSelectionKey(asset))));
  }

  function reorderSelected(assets: SelectedContentAsset[]) {
    selectionDoc.save(assets);
  }

  const composerMediaUrls = useMemo(() => {
    if (generatedMediaUrl) {
      const abs = absoluteMediaUrl(generatedMediaUrl);
      return abs ? [abs] : [];
    }
    if (singleMediaUrl) {
      const abs = absoluteMediaUrl(singleMediaUrl);
      return abs && !abs.startsWith("blob:") ? [abs] : [];
    }
    return publishMediaUrlsFromAssets(selectedContent);
  }, [generatedMediaUrl, singleMediaUrl, selectedContent]);

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
    next.delete("tab"); // stay on Publicera
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, pipelinePosts]);

  useEffect(() => {
    if (searchParams.get("create") !== "canva") return;
    const next = new URLSearchParams(searchParams);
    if (next.get("tab")) {
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
    const timeout = window.setTimeout(() => {
      canvaInputRef.current?.focus();
      canvaInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchParams, setSearchParams]);

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

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const blobUrl = URL.createObjectURL(file);
    setSingleMediaUrl(blobUrl);
    setGeneratedMediaUrl(null);
    setImageSource(null);

    try {
      const uploaded = await uploadContentMedia({ file, businessProfileId });
      setGeneratedMediaUrl(uploaded.url);
      setSingleMediaUrl(uploaded.url);
      setImageSource(null);
      const asset: SelectedContentAsset = {
        id: `upload-${Date.now()}`,
        name: uploaded.filename,
        mimeType: uploaded.contentType,
        kind: file.type.startsWith("video/") ? "video" : "image",
        thumbnailUrl: uploaded.url,
        previewUrl: uploaded.url,
        sourceAccountId: "upload",
        sourceAccountName: "Upload",
      };
      saveAssetSelection(asset, true);
      record({
        name: uploaded.filename,
        mimeType: uploaded.contentType,
        kind: asset.kind,
        mediaUrl: uploaded.url,
        thumbnailUrl: uploaded.url,
        source: "upload",
        sourceLabel: "Upload",
      });
      toast.success(t("toasts.uploadSuccess"));
    } catch {
      toast.message(t("toasts.uploadPreviewOnly"));
    }
  }

  function handleGeneratedImage(asset: SelectedContentAsset) {
    const url = asset.previewUrl || asset.thumbnailUrl;
    setSingleMediaUrl(url);
    setGeneratedMediaUrl(url);
    setImageSource(asset.sourceAccountId === "canva" ? "canva" : "openai");
    saveAssetSelection(asset, true);
    record({
      name: asset.name,
      mimeType: asset.mimeType,
      kind: asset.kind,
      mediaUrl: url,
      thumbnailUrl: asset.thumbnailUrl || url,
      source: asset.sourceAccountId === "canva" ? "canva" : "openai",
      sourceLabel: asset.sourceAccountName,
    });
    toast.message(t("toasts.savedToHistory"));
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={Sparkles}
        title={t("page.title")}
        description={t("page.description")}
      />

      {socialAccounts.length === 0 ? (
        <PageSmartBar
          title={t("smartBar.titleEmpty")}
          steps={[
            t("smartBar.step1"),
            t("smartBar.step2"),
            t("smartBar.step3"),
          ]}
          tip={t("smartBar.tip")}
          liveHintOverride={t("smartBar.liveHintNoAccounts")}
          extraActions={[{ label: t("smartBar.connectAccount"), to: "/connections" }]}
        />
      ) : pipelinePosts.length + scheduledContentTasks.length > 0 ? (
        <PageSmartBar
          title={t("smartBar.titleActive")}
          liveHintOverride={t("smartBar.liveHintQueued", {
            count: pipelinePosts.length + scheduledContentTasks.length,
          })}
        />
      ) : null}

      <PageModeTabs
        value={socialMode}
        aria-label={t("tabs.ariaLabel")}
        onChange={setSocialMode}
        options={[
          { value: "publish", label: t("tabs.publish") },
          { value: "stats", label: t("tabs.stats") },
          {
            value: "more",
            label: t("tabs.more"),
            count: pipelinePosts.length + scheduledContentTasks.length,
          },
        ]}
      />

      {socialMode === "publish" ? (
      <m.div {...fadeUp} transition={{ duration: 0.35 }} className="app-workspace-shell !min-h-0">
        <div className="min-h-0 flex-1 space-y-3 p-3 sm:p-4">
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
                    className="min-h-10 min-w-fit gap-2 rounded-md px-3 py-2.5 text-sm data-[state=active]:bg-accent data-[state=active]:shadow-none sm:min-h-0 sm:py-2 sm:text-xs"
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
            const platformConnections = connections.filter((connection) => connection.platform === platform);
            const status: ConnectionStatus =
              linkedAccounts.length > 0 && platformConnections.length === 0
                ? "connected"
                : aggregateStatus(platformConnections);
            const needsAttention = status === "error" || status === "reconnect_required";
            const showStatusCard = linkedAccounts.length === 0 || needsAttention;
            if (!showStatusCard) {
              return <TabsContent key={entry.platform} value={entry.platform} className="mt-0" />;
            }
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
                          {needsAttention ? t("connections.needsAttention") : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {globalT("catalog:notConnectedProfile", {
                            steps: catalogConnectSteps(entry),
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
                      <ConnectionStatusBadge status={status} />
                      {status === "not_connected" ? (
                        <Link
                          to={`/connections?q=${encodeURIComponent(entry.label)}`}
                          className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                        >
                          {t("connections.connectNow")}
                        </Link>
                      ) : needsAttention ? (
                        <Link
                          to={`/connections?filter=attention&q=${encodeURIComponent(entry.label)}`}
                          className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                        >
                          {t("connections.fix")}
                        </Link>
                      ) : null}
                      <Link
                        to="/preferences?tab=api-keys"
                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {t("connections.apiKeys")}
                      </Link>
                    </div>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
        </div>
      </m.div>
      ) : null}

      {authMode === "local" && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                {t("localMode")}
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}

      {oauthErrorDetails && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage({
              ...oauthErrorDetails,
              code: OAUTH_ERROR_ALIASES[oauthErrorDetails.code] || oauthErrorDetails.code,
            })}
            onDismiss={clearOauthError}
          />
        </m.div>
      )}
      {error && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-destructive">{t("stats.loadError", { error })}</p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => void refreshStats()}>
                  {t("stats.retry")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                  {t("stats.close")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {socialMode === "stats" ? (
      <SocialStatsSection
        account={selectedAccount}
        loading={statsLoading}
        onRefresh={() => void refreshStats()}
        posts={recentPosts}
      />
      ) : null}

      {socialMode === "stats" && !selectedAccount && showOverview && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <SocialOverviewCard accounts={socialAccounts} />
        </m.div>
      )}

      {socialMode === "stats" && !selectedAccount && !showOverview && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <EmptyState
            icon={Sparkles}
            title={t("empty.selectAccountTitle")}
            description={t("empty.selectAccountDesc")}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/connections">{t("empty.openConnections")}</Link>
              </Button>
            }
          />
        </m.div>
      )}

      {socialMode === "stats" && selectedAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {(() => { const Icon = platformIcons[selectedAccount.platform]; return <Icon className="h-4 w-4 text-muted-foreground" />; })()}
              <span className="text-sm font-medium text-muted-foreground">@{selectedAccount.username}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <Sparkles className="h-3.5 w-3.5" />
              {t("analysis.aiAnalysis")}
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="py-5 px-6">
              {analyzing ? (
                <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{t("analysis.analyzing")}</span>
                </div>
              ) : analysisResult ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("analysis.about")}</p>
                    <p className="text-sm leading-relaxed">{analysisResult.about}</p>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("analysis.writes")}</p>
                    <p className="text-sm leading-relaxed">{analysisResult.writes}</p>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("analysis.perception")}</p>
                    <p className="text-sm leading-relaxed">{analysisResult.perception}</p>
                  </div>
                </div>
              ) : statsLoading ? (
                <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>
                    {selectedAccount.platform === "google_business"
                      ? t("analysis.loadingProfile")
                      : t("analysis.loadingPosts")}
                  </span>
                </div>
              ) : selectedZernioNote ? (
                <p className="text-sm text-muted-foreground py-2">{selectedZernioNote}</p>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  {t("analysis.noData")}
                </p>
              )}
            </CardContent>
          </Card>
        </m.div>
      )}

      {socialMode === "stats" &&
        selectedAccount?.platform === "google_business" &&
        socialData &&
        dataAccountId === selectedAccountId && (
          <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.12 }}>
            <GoogleBusinessCard panel={socialData.googleBusiness} loading={statsLoading} />
          </m.div>
        )}

      {socialMode === "publish" ? (
      <>
      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
        <SelectedContentPanel
          compact
          selectedAssets={selectedContent}
          onRemove={removeFromSelected}
          onRemoveMany={removeManyFromSelected}
          onClear={() => selectionDoc.save([])}
          onReorder={reorderSelected}
          onGoBrowse={() => {}}
          onGoHistory={() => {}}
          onCreate={() => {}}
          onPublish={() => {
            document.getElementById("social-publish-composer")?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </m.div>

      {selectedContentVideos.length > 0 ? (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.16 }}>
          <SocialVideoDraftCard videos={selectedContentVideos} />
        </m.div>
      ) : null}

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }} id="social-publish-composer">
        {safetyImageAssets.length > 0 ? (
          <div className="mb-4">
            <PublishSafetyPanel
              businessProfileId={businessProfileId}
              imageAssets={safetyImageAssets}
              readiness={publishReadiness}
              onReadinessChange={setPublishReadiness}
              onBeforeRequest={ensureBackendSession}
              autoRunModeration
            />
          </div>
        ) : null}
        <PublishComposer
          initialCaption={postContent}
          mediaUrls={composerMediaUrls}
          onCaptionChange={setPostContent}
          autoSelectAccounts
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
            setSingleMediaUrl(null);
            setImageSource(null);
            setPublishReadiness(null);
          }}
        />
      </m.div>

      </>
      ) : null}

      {socialMode === "more" ? (
      <>
      <AutomationEnableHint
        tab="content"
        focus="publish-scheduled-posts"
        title={t("more.automationHintTitle")}
        description={t("more.automationHintDesc")}
        ctaLabel={t("more.automationHintCta")}
      />
      <m.div {...fadeUp} transition={{ duration: 0.3 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.social}
          title={t("more.mcpTitle")}
          description={t("more.mcpDesc")}
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
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5" />
              {t("more.imageCardTitle")}
            </CardTitle>
            <CardDescription>
              {t("more.imageCardDescPrefix")}{" "}
              <Link to="/content?tab=selected" className="text-primary hover:underline">
                {t("more.imageCardDescLink")}
              </Link>
              {t("more.imageCardDescSuffix")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <ContentAiImageCard
              embedded
              allowLocalUpload
              localPreviewUrl={singleMediaUrl}
              onLocalUploadClick={() => fileInputRef.current?.click()}
              canvaInputRef={canvaInputRef}
              showContentActions={false}
              businessProfileId={businessProfileId}
              captionHint={postContent}
              canvaConnected={canvaConnected}
              onGenerated={handleGeneratedImage}
            />
          </CardContent>
        </Card>
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <ScheduledPostsList onEdit={setEditingPost} />
      </m.div>

      <InstagramDriveQueueCard />

      <SocialAutomationPanel />

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.05 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">{t("more.campaignsTitle")}</CardTitle>
              <Link to="/marketing" className="text-xs text-primary hover:underline">
                {t("more.campaignsManage")}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {scheduledContentTasks.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-foreground">{t("more.campaignsEmpty")}</p>
                  <Link to="/marketing">
                  <Button size="sm" variant="outline" className="text-xs">
                    {t("more.campaignsCreate")}
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
                          {t("more.campaignDeadline", { date: formatShortDate(task.due_at) })}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground shrink-0 ${
                      task.status === "in_progress" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : ""
                    }`}>
                      {task.status === "open" ? t("more.campaignStatusOpen") : task.status === "in_progress" ? t("more.campaignStatusActive") : t("more.campaignStatusPaused")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </m.div>
      </>
      ) : null}
    </div>
  );
}
