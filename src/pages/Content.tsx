import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { loadSelectedContent, saveSelectedContent, type SelectedContentAsset } from "@/lib/contentSelection";
import { useProfileDocument } from "@/features/profile-documents";
import { formatOAuthErrorMessage, type OAuthErrorDetails } from "@/lib/oauthErrors";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PublishComposer } from "@/features/content/PublishComposer";
import { CreateTab } from "@/features/content/CreateTab";
import { ContentFlowGuide } from "@/features/content/ContentFlowGuide";
import { ContentNextStepBar } from "@/features/content/ContentNextStepBar";
import { ContentIdeasHub } from "@/features/content/ContentIdeasHub";
import { GeneratedHistoryPanel } from "@/features/content/GeneratedHistoryPanel";
import { useGeneratedContentHistory } from "@/features/content/useGeneratedContentHistory";
import { PublishSafetyPanel } from "@/features/content/PublishSafetyPanel";
import { publishBlockReason, type PublishReadiness } from "@/features/content/apiaiResultInsights";
import { publishMediaUrlsFromAssets } from "@/features/content/contentPublishMedia";
import { apiUrl } from "@/lib/apiBase";
import { consumeContentCaption } from "@/lib/contentCaptionHandoff";
import { Film, FolderOpen, History, Image as ImageIcon, Loader2, RefreshCw, HardDrive, Users, ChevronDown, ExternalLink, ArrowLeft, Wand2, Search, Send } from "lucide-react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";

type DriveBrowserItem = {
  id: string;
  name: string;
  mimeType: string;
  kind: "folder" | "image" | "video" | "other";
  thumbnailUrl: string;
  iconLink?: string;
  isShortcut?: boolean;
  previewUrl?: string;
  webViewLink?: string;
  modifiedTime?: string;
  ownerName?: string;
  size?: number;
};

type DriveProviderData = {
  source?: string;
  items?: DriveBrowserItem[];
  sharedItems?: DriveBrowserItem[];
  currentFolderId?: string | null;
  currentFolderName?: string | null;
  parentFolderId?: string | null;
} | null;

type DriveOAuthPopupMessage = {
  type: "google_drive_oauth";
  success?: boolean;
  error?: string;
  statusCode?: string | null;
  exception?: string | null;
  hint?: string | null;
  platform?: "google_drive";
  account_id?: string;
  username?: string;
  profile_id?: string;
};

const OAUTH_MESSAGES: Record<string, string> = {
  google_drive_not_configured: "Google Drive is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.",
  backend_unavailable:
    "Backend server is not reachable. Start the API server on port 3001 before connecting Google Drive.",
};

function formatBytes(value?: number) {
  if (!value || Number.isNaN(value)) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function MediaTile({
  file,
  checked,
  onToggle,
}: {
  file: DriveBrowserItem;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  // Per-tile image-failure state so a dead Drive thumbnail falls back to the
  // type icon instead of rendering a broken image.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(file.thumbnailUrl) && !imgFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={checked}
      aria-label={`${checked ? "Deselect" : "Select"} ${file.name}`}
      className="group relative rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => onToggle(!checked)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(!checked);
        }
      }}
    >
      <div className="aspect-square bg-secondary/50 flex items-center justify-center overflow-hidden relative">
        {showImage ? (
          <img
            src={file.thumbnailUrl}
            alt={file.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : file.kind === "video" ? (
          <Film className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
        {checked && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
              <span className="text-[10px] text-primary-foreground font-bold">✓</span>
            </div>
          </div>
        )}
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-md bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-black/80"
            title="Open in Google Drive"
          >
            <ExternalLink className="h-3.5 w-3.5 text-white" />
          </a>
        )}
      </div>
      <div className="p-2">
        <p className="text-[11px] font-medium truncate">{file.name}</p>
        {file.size ? <p className="text-[10px] text-muted-foreground/70">{formatBytes(file.size)}</p> : null}
      </div>
    </div>
  );
}

const GRID_BATCH_SIZE = 12;
const GRID_INITIAL = 8;

function MediaSection({
  title,
  icon,
  files,
  expanded,
  onToggleExpand,
  previewCount,
  selectedIds,
  onToggleAsset,
}: {
  title: string;
  icon: React.ReactNode;
  files: DriveBrowserItem[];
  expanded: boolean;
  onToggleExpand: () => void;
  previewCount: number;
  selectedIds: Set<string>;
  onToggleAsset: (file: DriveBrowserItem, checked: boolean) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(expanded ? Math.max(files.length, GRID_INITIAL) : previewCount);

  useEffect(() => {
    setVisibleCount(expanded ? Math.max(files.length, GRID_INITIAL) : previewCount);
  }, [expanded, files.length, previewCount]);

  const visible = files.slice(0, visibleCount);
  const hidden = files.length - visible.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({files.length})</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {visible.map((file) => (
          <MediaTile
            key={file.id}
            file={file}
            checked={selectedIds.has(file.id)}
            onToggle={(checked) => onToggleAsset(file, checked)}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => {
            if (expanded && visibleCount >= files.length) {
              onToggleExpand();
              return;
            }
            if (!expanded) onToggleExpand();
            setVisibleCount((count) => Math.min(files.length, count + GRID_BATCH_SIZE));
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded && visibleCount >= files.length ? "rotate-180" : ""}`} />
          {expanded && visibleCount >= files.length
            ? "Show less"
            : `Show ${Math.min(hidden, GRID_BATCH_SIZE)} more ${title.toLowerCase()}`}
        </button>
      ) : expanded ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          Show less
        </button>
      ) : null}
    </div>
  );
}

export default function ContentPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, addAccountFromOAuth, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((profile) => profile.id === (activeBusinessProfileId ?? activeProfileId));
  const contentIdeasContext = {
    businessName: activeProfile?.name,
    description: activeProfile?.notes ?? undefined,
    audience: activeProfile?.location ? `Customers in ${activeProfile.location}` : undefined,
  };
  const canvaConnected = useMemo(
    () => accounts.some((account) => account.platform === "canva" && !account.disconnectedAt),
    [accounts]
  );
  const selectedAccountId = getSelectedAccountId("content");
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [driveView, setDriveView] = useState<"my-drive" | "shared-with-me">("my-drive");
  const [contentTab, setContentTab] = useState<"browse" | "create" | "history" | "publish">("browse");
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness | null>(null);
  const { history: generatedHistory, recordAsset, remove: removeGenerated, clear: clearGenerated, isLoading: historyLoading } =
    useGeneratedContentHistory();
  const [popupOauthError, setPopupOauthError] = useState<OAuthErrorDetails | null>(null);
  // Selected content assets persist per business profile in the DB (synced
  // across devices and live across pages via React Query), migrating any
  // device-local selection on first load.
  const selectionDoc = useProfileDocument<SelectedContentAsset[]>("content-selection", [], {
    legacyRead: () => {
      const v = loadSelectedContent(activeProfileId);
      return v.length ? v : undefined;
    },
    legacyWrite: (_bpId, value) => saveSelectedContent(activeProfileId, value),
  });
  const selectedAssets = selectionDoc.data;

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

    if (authMode === "cloud" && accessToken) {
      await fetchWithTimeout(apiUrl("/api/auth/session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      }).catch(() => {});
    }
  }, [authMode, accessToken]);

  // Stable list of Drive accounts (memoized so refs don't churn on every render)
  const driveAccounts = useMemo(
    () => accounts.filter((a) => a.platform === "google_drive" && Boolean(a.isOAuth)),
    [accounts]
  );
  const activeAccount = useMemo(() => {
    if (selectedAccountId) {
      const hit = driveAccounts.find((a) => a.id === selectedAccountId);
      if (hit) return hit;
    }
    return driveAccounts[0] ?? null;
  }, [driveAccounts, selectedAccountId]);

  const [providerData, setProviderData] = useState<DriveProviderData>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [driveSearch, setDriveSearch] = useState("");
  const driveRequestIdRef = useRef(0);

  // Auto-select first account if nothing chosen
  useEffect(() => {
    if (driveAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId("content", driveAccounts[0].id);
    }
  }, [driveAccounts, selectedAccountId, setSelectedAccountId]);

  const ensureBackendSessionRef = useRef(ensureBackendSession);
  useEffect(() => {
    ensureBackendSessionRef.current = ensureBackendSession;
  }, [ensureBackendSession]);

  const activeAccountId = activeAccount?.id ?? null;

  // Single source of truth for fetching Drive data.
  // Deps are PRIMITIVES only — no object references that churn each render.
  useEffect(() => {
    if (!activeAccountId) {
      setProviderData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const reqId = ++driveRequestIdRef.current;
    const params = new URLSearchParams();
    if (currentFolderId) params.set("folderId", currentFolderId);
    if (driveView === "shared-with-me") params.set("view", "shared-with-me");
    const url = accountDataUrl(activeAccountId, activeBusinessProfileId ?? activeProfileId, params);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let res = await fetchWithTimeout(url, { credentials: "include" });
        if (res.status === 401) {
          await ensureBackendSessionRef.current();
          res = await fetchWithTimeout(url, { credentials: "include" });
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(apiErrorMessage(payload, "Could not fetch Google Drive content."));
        }
        const data = await res.json();
        if (driveRequestIdRef.current !== reqId) return;
        setProviderData(data);
      } catch (e) {
        if (driveRequestIdRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (driveRequestIdRef.current === reqId) setLoading(false);
      }
    })();
  }, [activeAccountId, activeBusinessProfileId, activeProfileId, currentFolderId, driveView, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  // Backend always puts the relevant items in `items` — view=shared-with-me puts shared in items too
  const activeItems = providerData?.items || [];
  const driveQuery = driveSearch.trim().toLowerCase();
  const filteredActiveItems = useMemo(() => {
    if (!driveQuery) return activeItems;
    return activeItems.filter((item) => item.name.toLowerCase().includes(driveQuery));
  }, [activeItems, driveQuery]);
  const folderItems = filteredActiveItems.filter((item) => item.kind === "folder");
  const imageItems = filteredActiveItems.filter((item) => item.kind === "image");
  const videoItems = filteredActiveItems.filter((item) => item.kind === "video");
  const otherItems = filteredActiveItems.filter((item) => item.kind === "other");

  const PREVIEW_COUNT = 4;
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const selectedIds = useMemo(() => new Set(selectedAssets.map((asset) => asset.id)), [selectedAssets]);
  const selectedImages = selectedAssets.filter((asset) => asset.kind === "image");
  const selectedVideos = selectedAssets.filter((asset) => asset.kind === "video");
  const publishMediaUrls = useMemo(() => publishMediaUrlsFromAssets(selectedAssets), [selectedAssets]);
  const [publishCaption, setPublishCaption] = useState("");
  const combinedOauthError = popupOauthError || oauthErrorDetails;
  const createBusinessProfileId = activeBusinessProfileId ?? activeProfileId;
  const publishBlockedReason = publishBlockReason(publishReadiness);

  const goToTab = useCallback(
    (tab: "browse" | "create" | "history" | "publish") => {
      setContentTab(tab);
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "browse" || tab === "create" || tab === "history" || tab === "publish") {
      setContentTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const pending = consumeContentCaption();
    if (!pending) return;
    setPublishCaption(pending);
    setContentTab("publish");
    setSearchParams({ tab: "publish" }, { replace: true });
    toast.success("Idea added — ready to post or save");
  }, [setSearchParams]);

  useEffect(() => {
    setCurrentFolderId(null);
    setFolderStack([]);
    setDriveView("my-drive");
  }, [selectedAccountId]);

  useEffect(() => {
    let ignore = false;

    async function syncDriveAccountsFromBackend() {
      try {
        const connectedParams = new URLSearchParams({ platform: "google_drive" });
        const connectedProfileId = activeBusinessProfileId ?? activeProfileId;
        if (connectedProfileId) connectedParams.set("business_profile_id", connectedProfileId);
        let res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${connectedParams.toString()}`), { credentials: "include" });
        if (res.status === 401) {
          await ensureBackendSession();
          res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${connectedParams.toString()}`), { credentials: "include" });
        }
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || ignore) return;

        const backendAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
        if (backendAccounts.length === 0) return;
        const existingAccountIds = new Set(accounts.map((account) => account.id));

        for (const account of backendAccounts) {
          const accountId = String(account.account_id || "");
          if (!accountId || existingAccountIds.has(accountId)) continue;
          existingAccountIds.add(accountId);
          addAccountFromOAuth(
            accountId,
            "google_drive",
            String(account.username || "Google Drive"),
            account.profile_id ? String(account.profile_id) : undefined,
            {
              displayName: account.displayName ? String(account.displayName) : undefined,
              profileUrl: account.profileUrl ? String(account.profileUrl) : undefined,
              isZernio: Boolean(account.isZernio),
              zernioAccountId: account.zernioAccountId ? String(account.zernioAccountId) : undefined,
              // Background hydration must not flip the active profile.
              switchActiveProfile: false,
            }
          );
        }

        if (!selectedAccountId) {
          setSelectedAccountId("content", String(backendAccounts[0].account_id || ""));
        }
      } catch {
        // Best-effort hydration only.
      }
    }

    void syncDriveAccountsFromBackend();
    return () => {
      ignore = true;
    };
  }, [accounts, activeBusinessProfileId, activeProfileId, addAccountFromOAuth, selectedAccountId, setSelectedAccountId, ensureBackendSession]);

  useEffect(() => {
    function handleDriveOauthMessage(event: MessageEvent<DriveOAuthPopupMessage>) {
      if (event.origin !== window.location.origin) return;
      const payload = event.data;
      if (!payload || payload.type !== "google_drive_oauth") return;

      if (payload.error) {
        setPopupOauthError({
          code: payload.error,
          statusCode: payload.statusCode || null,
          exception: payload.exception || null,
          hint: payload.hint || null,
        });
        return;
      }

      if (payload.success && payload.platform === "google_drive" && payload.account_id && payload.username) {
        setPopupOauthError(null);
        addAccountFromOAuth(payload.account_id, payload.platform, payload.username, payload.profile_id);
        setSelectedAccountId("content", payload.account_id);
        setCurrentFolderId(null);
      }
    }

    window.addEventListener("message", handleDriveOauthMessage);
    return () => window.removeEventListener("message", handleDriveOauthMessage);
  }, [addAccountFromOAuth, setSelectedAccountId]);

  async function connectDrive() {
    setIsConnecting(true);
    setPopupOauthError(null);
    try {
      await ensureBackendSession();
      const healthRes = await fetchWithTimeout(apiUrl("/api/health"), { credentials: "include" });
      if (!healthRes.ok) {
        setPopupOauthError({
          code: "backend_unavailable",
          statusCode: String(healthRes.status),
          exception: "Health check failed before starting Google Drive OAuth.",
          hint: "Start the backend with `npm run dev` or `npm run dev:server`, then try again.",
        });
        return;
      }
    } catch {
      setPopupOauthError({
        code: "backend_unavailable",
        statusCode: null,
        exception: "Could not reach `/api/health` before starting Google Drive OAuth.",
        hint: "Start the backend with `npm run dev` or `npm run dev:server`, then try again.",
      });
      return;
    } finally {
      setIsConnecting(false);
    }

    const params = new URLSearchParams();
    params.set("app_origin", window.location.origin);
    appendOAuthProfileParams(params, activeProfileId);
    params.set("popup", "1");
    const query = params.toString() ? `?${params.toString()}` : "";
    const popupWidth = 540;
    const popupHeight = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - popupWidth) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - popupHeight) / 2));
    const popup = window.open(
      `${apiUrl("/api/auth/google_drive")}${query}`,
      "google-drive-oauth",
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top}`
    );

    if (!popup) {
      params.delete("popup");
      const fallbackQuery = params.toString() ? `?${params.toString()}` : "";
      window.location.href = `${apiUrl("/api/auth/google_drive")}${fallbackQuery}`;
      return;
    }

    popup.focus();
  }

  function assetFromDriveFile(file: DriveBrowserItem): SelectedContentAsset | null {
    if ((file.kind !== "image" && file.kind !== "video") || !activeAccount) return null;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      thumbnailUrl: file.thumbnailUrl,
      previewUrl: file.previewUrl,
      webViewLink: file.webViewLink,
      sourceAccountId: activeAccount.id,
      sourceAccountName: activeAccount.username || "Google Drive",
    };
  }

  function saveAssetSelection(asset: SelectedContentAsset, checked: boolean) {
    const next: SelectedContentAsset[] = checked
      ? [
          ...selectedAssets.filter(
            (existing) => `${existing.sourceAccountId}:${existing.id}` !== `${asset.sourceAccountId}:${asset.id}`
          ),
          asset,
        ]
      : selectedAssets.filter(
          (existing) => `${existing.sourceAccountId}:${existing.id}` !== `${asset.sourceAccountId}:${asset.id}`
        );

    selectionDoc.save(next);
  }

  function recordGeneratedAsset(asset: SelectedContentAsset, options?: { toolName?: string }) {
    recordAsset(asset, options);
  }

  function saveGeneratedToSelection(asset: SelectedContentAsset, options?: { toolName?: string }) {
    saveAssetSelection(asset, true);
    recordAsset(asset, options);
    toast.success("Saved to selection and history");
  }

  function toggleAsset(file: DriveBrowserItem, checked: boolean) {
    const asset = assetFromDriveFile(file);
    if (!asset) return;
    saveAssetSelection(asset, checked);
  }

  function navigateIntoFolder(folder: { id: string; name: string }) {
    setFolderStack((prev) => [...prev, folder]);
    setCurrentFolderId(folder.id);
  }

  function navigateBack() {
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    setCurrentFolderId(newStack.length > 0 ? newStack[newStack.length - 1].id : null);
  }

  function handleClearSelection() {
    selectionDoc.save([]);
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <PageHeader
        icon={FolderOpen}
        title="Content"
        description="Pick media from Drive, create with apiai.me, then publish or save a draft — all in one flow."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void connectDrive()}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FolderOpen className="h-4 w-4 mr-2" />
              )}
              Connect Google Drive
            </Button>
            {activeAccount ? (
              <Button
                variant="ghost"
                onClick={() => void refresh()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
            ) : null}
          </>
        }
      />

      <SectionConnectionStatus area="content" className="mt-0" />

      <McpFeatureSection
        businessProfileId={createBusinessProfileId}
        featureIds={MCP_PAGE_FEATURE_IDS.content}
        title="MCP content tools"
        description="Generate decks (Gamma) or design briefs (Canva MCP). Connect providers under Connections → MCP if status shows a missing key."
      />

      <ContentFlowGuide
        active={contentTab}
        selectionCount={selectedAssets.length}
        onGo={goToTab}
      />

      <ContentIdeasHub
        businessProfileId={createBusinessProfileId}
        socialContext={contentIdeasContext}
        outreachContext={{
          businessName: contentIdeasContext.businessName,
          description: contentIdeasContext.description,
          location: activeProfile?.location,
          targetAudience: contentIdeasContext.audience,
          idealCustomer: contentIdeasContext.description,
        }}
        onUseIdea={(text) => {
          setPublishCaption(text);
          goToTab("publish");
          toast.success("Idea added — ready to post or save");
        }}
      />

      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => goToTab("browse")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
            contentTab === "browse"
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardDrive className="h-3.5 w-3.5" />
          Browse
        </button>
        <button
          type="button"
          onClick={() => goToTab("create")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
            contentTab === "create"
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Create
        </button>
        <button
          type="button"
          onClick={() => goToTab("history")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
            contentTab === "history"
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          History
          {generatedHistory.length > 0 ? (
            <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{generatedHistory.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => goToTab("publish")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
            contentTab === "publish"
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          Post or save
        </button>
      </div>

      {combinedOauthError ? (
        <OAuthErrorAlert
          details={combinedOauthError}
          message={formatOAuthErrorMessage(combinedOauthError, OAUTH_MESSAGES, "Content connect failed")}
          onDismiss={() => {
            setPopupOauthError(null);
            clearOauthError();
          }}
        />
      ) : null}

      {contentTab === "create" ? (
        <CreateTab
          businessProfileId={createBusinessProfileId}
          selectedAssets={selectedAssets}
          availableAssets={imageItems.map((file) => assetFromDriveFile(file)).filter((asset): asset is SelectedContentAsset => Boolean(asset))}
          captionHint={publishCaption}
          canvaConnected={canvaConnected}
          onToggleAssetSelection={saveAssetSelection}
          onOpenBrowse={() => goToTab("browse")}
          onBeforeRequest={ensureBackendSession}
          onRecordGenerated={(asset, meta) => recordGeneratedAsset(asset, meta)}
          onSaveResultToSelection={(asset, meta) => {
            saveGeneratedToSelection(asset, meta);
          }}
          onContinueToPublish={() => goToTab("publish")}
          onPublishReadinessChange={setPublishReadiness}
        />
      ) : null}

      {contentTab === "history" ? (
        <GeneratedHistoryPanel
          items={generatedHistory}
          loading={historyLoading}
          onAddToSelection={(asset) => {
            saveAssetSelection(asset, true);
            toast.success("Added to selection");
          }}
          onRemove={removeGenerated}
          onClear={() => {
            clearGenerated();
            toast.message("History cleared");
          }}
        />
      ) : null}

      {contentTab === "publish" ? (
        <div className="space-y-4">
          {selectedAssets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Select at least one image or video in Browse first.</p>
                <Button variant="outline" size="sm" onClick={() => goToTab("browse")}>
                  Go to Browse
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <PublishSafetyPanel
            businessProfileId={createBusinessProfileId}
            imageAssets={selectedImages}
            readiness={publishReadiness}
            onReadinessChange={setPublishReadiness}
            onBeforeRequest={ensureBackendSession}
          />
          <PublishComposer
            initialCaption={publishCaption}
            mediaUrls={publishMediaUrls}
            onCaptionChange={setPublishCaption}
            publishBlockedReason={publishBlockedReason}
            publishWarning={
              publishReadiness && !publishReadiness.ok && publishReadiness.severity === "warn"
                ? publishReadiness.detail || publishReadiness.label
                : null
            }
          />
        </div>
      ) : null}

      {contentTab === "browse" ? (
        <>
      {error ? (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {activeAccount && (
        <div className="space-y-3">
          {/* View tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            <button
              onClick={() => { setDriveView("my-drive"); setCurrentFolderId(null); setFolderStack([]); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
                driveView === "my-drive"
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" />
              My Drive
            </button>
            <button
              onClick={() => { setDriveView("shared-with-me"); setCurrentFolderId(null); setFolderStack([]); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
                driveView === "shared-with-me"
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Shared with me
            </button>
          </div>
          {/* Breadcrumb with back arrow */}
          {folderStack.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <button
                onClick={navigateBack}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setFolderStack([]); setCurrentFolderId(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {driveView === "shared-with-me" ? "Shared with me" : "My Drive"}
              </button>
              {folderStack.map((f, i) => (
                <React.Fragment key={f.id}>
                  <span className="text-muted-foreground/50">/</span>
                  {i === folderStack.length - 1 ? (
                    <span className="font-medium truncate">{f.name}</span>
                  ) : (
                    <button
                      onClick={() => {
                        const newStack = folderStack.slice(0, i + 1);
                        setFolderStack(newStack);
                        setCurrentFolderId(newStack[newStack.length - 1].id);
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      {f.name}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {driveAccounts.length > 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Connected Drive accounts</CardTitle>
            <CardDescription>Pick which Google Drive connection to browse right now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {driveAccounts.map((account) => (
              <Button
                key={account.id}
                variant={selectedAccountId === account.id ? "default" : "outline"}
                onClick={() => setSelectedAccountId("content", account.id)}
              >
                {account.username}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Selected content</CardTitle>
          <CardDescription>
            {selectedAssets.length === 0
              ? "No files marked yet."
              : `${selectedAssets.length} file${selectedAssets.length === 1 ? "" : "s"} marked for creation.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {selectedImages.length} image{selectedImages.length === 1 ? "" : "s"} and {selectedVideos.length} video{selectedVideos.length === 1 ? "" : "s"} selected.
          </div>
          <Button variant="default" onClick={() => goToTab("create")} disabled={selectedAssets.length === 0}>
            Create with AI
          </Button>
          <Button variant="outline" onClick={() => goToTab("publish")} disabled={selectedAssets.length === 0}>
            Post or save
          </Button>
          <Button variant="outline" onClick={() => navigate("/social-media")} disabled={selectedAssets.length === 0}>
            Open Social Media
          </Button>
          <Button variant="ghost" onClick={handleClearSelection} disabled={selectedAssets.length === 0}>
            Clear selection
          </Button>
        </CardContent>
      </Card>

      {driveAccounts.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No Google Drive account connected yet"
          description="Connect Drive first, then you can browse folders and mark media here."
          action={
            <Button onClick={() => void connectDrive()} disabled={isConnecting}>
              {isConnecting ? "Connecting…" : "Connect Google Drive"}
            </Button>
          }
        />
      ) : loading ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search files by name…"
              value={driveSearch}
              onChange={(e) => setDriveSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          {folderItems.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {folderItems.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => navigateIntoFolder({ id: folder.id, name: folder.name })}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-center group"
                  >
                    <div className="h-12 w-12 rounded-lg bg-secondary/60 flex items-center justify-center group-hover:bg-secondary transition-colors">
                      <FolderOpen className="h-6 w-6 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{folder.name}</p>
                      {folder.modifiedTime && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {new Date(folder.modifiedTime).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(imageItems.length > 0 || videoItems.length > 0) && (
            <>
              {imageItems.length > 0 && (
                <MediaSection
                  title="Images"
                  icon={<ImageIcon className="h-4 w-4" />}
                  files={imageItems}
                  expanded={imagesExpanded}
                  onToggleExpand={() => setImagesExpanded((v) => !v)}
                  previewCount={PREVIEW_COUNT}
                  selectedIds={selectedIds}
                  onToggleAsset={toggleAsset}
                />
              )}
              {videoItems.length > 0 && (
                <MediaSection
                  title="Videos"
                  icon={<Film className="h-4 w-4" />}
                  files={videoItems}
                  expanded={videosExpanded}
                  onToggleExpand={() => setVideosExpanded((v) => !v)}
                  previewCount={PREVIEW_COUNT}
                  selectedIds={selectedIds}
                  onToggleAsset={toggleAsset}
                />
              )}
            </>
          )}

          {otherItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Other files</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {otherItems.map((file) => (
                  <div key={`${file.id}-${file.name}`} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors">
                    <div className="h-8 w-8 rounded-md bg-secondary/40 flex items-center justify-center shrink-0 overflow-hidden">
                      {file.iconLink ? (
                        <img src={file.iconLink} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <p className="text-[11px] text-muted-foreground/70">{file.mimeType}</p>
                    </div>
                    {file.webViewLink && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs shrink-0" asChild>
                        <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">Open</a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredActiveItems.length === 0 && !loading && (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {driveQuery
                    ? `No files matching "${driveSearch.trim()}".`
                    : driveView === "shared-with-me"
                    ? "No files shared with you."
                    : providerData?.currentFolderName
                    ? `No files in "${providerData.currentFolderName}".`
                    : "No files found in My Drive. Try browsing into a subfolder — or switch to Shared with me."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
        </>
      ) : null}

      <ContentNextStepBar
        active={contentTab}
        selectionCount={selectedAssets.length}
        historyCount={generatedHistory.length}
        onGo={goToTab}
      />
    </div>
  );
}
