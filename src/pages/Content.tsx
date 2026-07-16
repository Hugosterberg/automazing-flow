import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadSelectedContent, saveSelectedContent, assetSelectionKey, type SelectedContentAsset } from "@/lib/contentSelection";
import { fetchProducts } from "@/lib/productsApi";
import { useProfileDocument } from "@/features/profile-documents";
import { formatOAuthErrorMessage, type OAuthErrorDetails } from "@/lib/oauthErrors";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageAiSuggestionsStrip } from "@/features/ai-recommendations/PageAiSuggestionsStrip";
import { AutomationEnableHint } from "@/features/automation";
import { EmptyState } from "@/components/ui/empty-state";
import { PublishComposer } from "@/features/content/PublishComposer";
import { CreateTab } from "@/features/content/CreateTab";
import type { ApiaiBatchIngestItem } from "@/features/content/apiaiClient";
import { ContentNextStepBar } from "@/features/content/ContentNextStepBar";
import { isContentTab, type ContentTab } from "@/features/content/contentFlow";
import { SelectedContentPanel } from "@/features/content/SelectedContentPanel";
import { ContentUploadDropzone } from "@/features/content/ContentUploadDropzone";
import { ContentIdeasHub } from "@/features/content/ContentIdeasHub";
import { GeneratedHistoryPanel } from "@/features/content/GeneratedHistoryPanel";
import { useGeneratedContentHistory } from "@/features/content/useGeneratedContentHistory";
import { PublishSafetyPanel } from "@/features/content/PublishSafetyPanel";
import { publishBlockReason, type PublishReadiness } from "@/features/content/apiaiResultInsights";
import { publishMediaUrlsFromAssets } from "@/features/content/contentPublishMedia";
import { uploadContentMedia } from "@/features/content/contentMediaClient";
import { enqueueContentPipelineItems } from "@/features/content/contentPipelineQueue";
import { apiUrl } from "@/lib/apiBase";
import { consumeContentCaption } from "@/lib/contentCaptionHandoff";
import { Film, FolderOpen, History, Image as ImageIcon, ImagePlus, Loader2, RefreshCw, HardDrive, Users, ChevronDown, ExternalLink, ArrowLeft, Wand2, Search, Send, BookmarkCheck, MoreHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
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
  focused = false,
}: {
  file: DriveBrowserItem;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  focused?: boolean;
}) {
  // Per-tile image-failure state so a dead Drive thumbnail falls back to the
  // type icon instead of rendering a broken image.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(file.thumbnailUrl) && !imgFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      data-drive-file-id={file.id}
      aria-pressed={checked}
      aria-label={`${checked ? "Ta bort från Valda" : "Lägg till i Valda"} ${file.name}`}
      className={cn(
        "group relative rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        focused && "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50"
      )}
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
  selectionKeyForFile,
  onToggleAsset,
  focusedFileId,
}: {
  title: string;
  icon: React.ReactNode;
  files: DriveBrowserItem[];
  expanded: boolean;
  onToggleExpand: () => void;
  previewCount: number;
  selectedIds: Set<string>;
  selectionKeyForFile: (file: DriveBrowserItem) => string;
  onToggleAsset: (file: DriveBrowserItem, checked: boolean) => void;
  focusedFileId?: string | null;
}) {
  const [visibleCount, setVisibleCount] = useState(expanded ? Math.max(files.length, GRID_INITIAL) : previewCount);

  useEffect(() => {
    setVisibleCount(expanded ? Math.max(files.length, GRID_INITIAL) : previewCount);
  }, [expanded, files.length, previewCount]);

  useEffect(() => {
    if (!focusedFileId) return;
    const idx = files.findIndex((file) => file.id === focusedFileId);
    if (idx < 0) return;
    if (!expanded) onToggleExpand();
    setVisibleCount((count) => Math.max(count, idx + 1));
  }, [focusedFileId, files, expanded, onToggleExpand]);

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
            checked={selectedIds.has(selectionKeyForFile(file))}
            onToggle={(checked) => onToggleAsset(file, checked)}
            focused={focusedFileId === file.id}
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
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, addAccountFromOAuth, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((profile) => profile.id === (activeBusinessProfileId ?? activeProfileId));
  const createBusinessProfileId = activeBusinessProfileId ?? activeProfileId ?? null;
  const [topProductNames, setTopProductNames] = useState<string[]>([]);

  useEffect(() => {
    if (!createBusinessProfileId) {
      setTopProductNames([]);
      return;
    }
    let cancelled = false;
    fetchProducts(createBusinessProfileId)
      .then((products) => {
        if (cancelled) return;
        setTopProductNames(
          products
            .slice(0, 3)
            .map((p) => p.name)
            .filter(Boolean),
        );
      })
      .catch(() => {
        if (!cancelled) setTopProductNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [createBusinessProfileId]);

  const contentIdeasContext = {
    businessName: activeProfile?.name,
    description: [
      activeProfile?.notes,
      topProductNames.length > 0 ? `Top products: ${topProductNames.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(". ") || undefined,
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
  const [contentTab, setContentTab] = useState<ContentTab>("browse");
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
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

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
          throw new Error(apiErrorMessage(payload, "Kunde inte hämta innehåll från Google Drive."));
        }
        const data = await res.json();
        if (driveRequestIdRef.current !== reqId) return;
        setProviderData(data);
      } catch (e) {
        if (driveRequestIdRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Anropet misslyckades");
      } finally {
        if (driveRequestIdRef.current === reqId) setLoading(false);
      }
    })();
  }, [activeAccountId, activeBusinessProfileId, activeProfileId, currentFolderId, driveView, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  // Backend always puts the relevant items in `items` — view=shared-with-me puts shared in items too
  const activeItems = useMemo(() => providerData?.items || [], [providerData]);
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
  const [focusedBrowseFileId, setFocusedBrowseFileId] = useState<string | null>(null);
  const [uploadingBrowse, setUploadingBrowse] = useState(false);
  const browseUploadRef = useRef<HTMLInputElement>(null);
  const driveSearchRef = useRef<HTMLInputElement>(null);
  const browseMediaFiles = useMemo(
    () => [...imageItems, ...videoItems],
    [imageItems, videoItems]
  );
  const focusedBrowseFile = useMemo(
    () => browseMediaFiles.find((file) => file.id === focusedBrowseFileId) ?? null,
    [browseMediaFiles, focusedBrowseFileId]
  );
  const selectedIds = useMemo(
    () => new Set(selectedAssets.map((asset) => assetSelectionKey(asset))),
    [selectedAssets]
  );
  const selectedImages = selectedAssets.filter((asset) => asset.kind === "image");
  const selectedVideos = selectedAssets.filter((asset) => asset.kind === "video");
  const publishMediaUrls = useMemo(() => publishMediaUrlsFromAssets(selectedAssets), [selectedAssets]);
  const [publishCaption, setPublishCaption] = useState("");
  const combinedOauthError = popupOauthError || oauthErrorDetails;
  const publishBlockedReason = publishBlockReason(publishReadiness);
  const initialCreateMode = useMemo(() => {
    const mode = searchParams.get("mode");
    if (mode === "generate" || mode === "transform" || mode === "batch") return mode;
    return undefined;
  }, [searchParams]);

  const goToTab = useCallback(
    (tab: ContentTab) => {
      setContentTab(tab);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (isContentTab(tab)) {
      setContentTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const pending = consumeContentCaption();
    if (!pending) return;
    setPublishCaption(pending);
    goToTab("publish");
    toast.success("Idea added — ready to post or save");
  }, [goToTab]);

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
        const existingAccountIds = new Set(accountsRef.current.map((account) => account.id));

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
  }, [activeBusinessProfileId, activeProfileId, addAccountFromOAuth, selectedAccountId, setSelectedAccountId, ensureBackendSession]);

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
          exception: "Hälsokontrollen misslyckades innan Google Drive-OAuth kunde startas.",
          hint: "Starta backend med `npm run dev` eller `npm run dev:server` och försök igen.",
        });
        return;
      }
    } catch {
      setPopupOauthError({
        code: "backend_unavailable",
        statusCode: null,
        exception: "Kunde inte nå `/api/health` innan Google Drive-OAuth kunde startas.",
        hint: "Starta backend med `npm run dev` eller `npm run dev:server` och försök igen.",
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
    const key = assetSelectionKey(asset);
    const next: SelectedContentAsset[] = checked
      ? [...selectedAssets.filter((existing) => assetSelectionKey(existing) !== key), asset]
      : selectedAssets.filter((existing) => assetSelectionKey(existing) !== key);

    selectionDoc.save(next);
  }

  function recordGeneratedAsset(asset: SelectedContentAsset, options?: { toolName?: string }) {
    recordAsset(asset, options);
  }

  function saveGeneratedToSelection(asset: SelectedContentAsset, options?: { toolName?: string }) {
    saveAssetSelection(asset, true);
    recordAsset(asset, options);
    toast.success("Tillagd i Valda och Historik");
  }

  function handleBatchIngested(
    items: ApiaiBatchIngestItem[],
    meta: { batchId: number; workflow?: string; addToSelection: boolean }
  ) {
    items.forEach((item, index) => {
      const asset: SelectedContentAsset = {
        id: `apiai-batch-${meta.batchId}-${index}`,
        name: item.filename,
        mimeType: item.contentType,
        kind: item.kind === "video" ? "video" : "image",
        thumbnailUrl: item.mediaUrl,
        previewUrl: item.mediaUrl,
        sourceAccountId: "apiai",
        sourceAccountName: "apiai.me",
      };
      recordAsset(asset, { toolName: meta.workflow || `batch #${meta.batchId}` });
      if (meta.addToSelection) saveAssetSelection(asset, true);
    });
    if (items.length > 0 && createBusinessProfileId) {
      void enqueueContentPipelineItems(
        createBusinessProfileId,
        items.map((item, index) => ({
          title: item.filename || `Batch ${meta.batchId} #${index + 1}`,
          captionHint: meta.workflow ? `Workflow: ${meta.workflow}` : undefined,
          accountIds: [],
          platforms: [],
          mediaUrls: [item.mediaUrl],
          scheduledFor: "",
        }))
      ).then((count) => {
        if (count > 0) {
          toast.message(
            count === 1 ? "1 objekt köat till innehållspipelinen" : `${count} objekt köade till innehållspipelinen`
          );
        }
      });
    }
    if (meta.addToSelection && items.length > 0) {
      goToTab("publish");
    }
  }

  async function handleBrowseUploadFiles(fileList: FileList | null) {
    if (!fileList?.length || !createBusinessProfileId) return;
    setUploadingBrowse(true);
    try {
      await ensureBackendSession();
      let added = 0;
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
        const uploaded = await uploadContentMedia({ file, businessProfileId: createBusinessProfileId });
        const asset: SelectedContentAsset = {
          id: `upload-${Date.now()}-${added}`,
          name: uploaded.filename,
          mimeType: uploaded.contentType,
          kind: file.type.startsWith("video/") ? "video" : "image",
          thumbnailUrl: uploaded.url,
          previewUrl: uploaded.url,
          sourceAccountId: "upload",
          sourceAccountName: "Upload",
        };
        saveGeneratedToSelection(asset, { toolName: "Upload" });
        added += 1;
      }
      if (added > 0) {
        toast.success(`${added} fil${added === 1 ? "" : "er"} uppladdade — tillagda i Valda`);
        goToTab("selected");
      } else {
        toast.message("Inga bild- eller videofiler valda");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppladdningen misslyckades");
    } finally {
      setUploadingBrowse(false);
      if (browseUploadRef.current) browseUploadRef.current.value = "";
    }
  }

  function toggleAsset(file: DriveBrowserItem, checked: boolean) {
    const asset = assetFromDriveFile(file);
    if (!asset) return;
    saveAssetSelection(asset, checked);
    if (checked) {
      toast.message("Tillagd i Valda");
    }
  }

  const navigateBrowseFileRelative = useCallback(
    (delta: 1 | -1) => {
      if (browseMediaFiles.length === 0) return;
      const currentIndex = focusedBrowseFileId
        ? browseMediaFiles.findIndex((file) => file.id === focusedBrowseFileId)
        : -1;
      const nextIndex =
        currentIndex < 0
          ? delta > 0
            ? 0
            : browseMediaFiles.length - 1
          : (currentIndex + delta + browseMediaFiles.length) % browseMediaFiles.length;
      setFocusedBrowseFileId(browseMediaFiles[nextIndex]?.id ?? null);
    },
    [browseMediaFiles, focusedBrowseFileId]
  );

  useEffect(() => {
    if (focusedBrowseFileId && !browseMediaFiles.some((file) => file.id === focusedBrowseFileId)) {
      setFocusedBrowseFileId(null);
    }
  }, [browseMediaFiles, focusedBrowseFileId]);

  useEffect(() => {
    if (!focusedBrowseFileId) return;
    document
      .querySelector(`[data-drive-file-id="${focusedBrowseFileId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedBrowseFileId, browseMediaFiles.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (contentTab !== "browse" || isTypingTarget(e.target) || isShortcutBlocked()) return;

      if (e.key === "/") {
        e.preventDefault();
        driveSearchRef.current?.focus();
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        navigateBrowseFileRelative(1);
        return;
      }

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        navigateBrowseFileRelative(-1);
        return;
      }

      if ((matchesKey(e, "s") && isPlainLetterShortcut(e)) && focusedBrowseFileId) {
        const file = browseMediaFiles.find((item) => item.id === focusedBrowseFileId);
        if (!file || !activeAccount) return;
        e.preventDefault();
        const key = assetSelectionKey({ id: file.id, sourceAccountId: activeAccount.id });
        toggleAsset(file, !selectedIds.has(key));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    contentTab,
    navigateBrowseFileRelative,
    focusedBrowseFileId,
    browseMediaFiles,
    activeAccount,
    selectedIds,
    toggleAsset,
  ]);

  function removeFromSelected(asset: SelectedContentAsset) {
    saveAssetSelection(asset, false);
  }

  function removeManyFromSelected(assets: SelectedContentAsset[]) {
    const keys = new Set(assets.map((asset) => assetSelectionKey(asset)));
    selectionDoc.save(selectedAssets.filter((asset) => !keys.has(assetSelectionKey(asset))));
  }

  function reorderSelected(assets: SelectedContentAsset[]) {
    selectionDoc.save(assets);
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
        title="Innehåll"
        description="Välj media från Drive, skapa med apiai.me och publicera eller spara som utkast — allt i ett flöde."
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
              Koppla Google Drive
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
                Uppdatera
              </Button>
            ) : null}
          </>
        }
      />

      {driveAccounts.length === 0 ? (
        <PageSmartBar
          title="Innehåll är hela flödet — välj media, skapa med AI, spara utkast och publicera."
          steps={[
            "Koppla Google Drive under Kopplingar",
            "Bläddra eller ladda upp — markera det du vill använda",
            "Skapa med AI, spara till Valda och publicera",
          ]}
          tip="När Drive är kopplat försvinner den här guiden — flikarna räcker för flödet."
          extraActions={[{ label: "Öppna Kopplingar", to: "/connections" }]}
        />
      ) : (contentTab === "browse" && browseMediaFiles.length > 0) || selectedAssets.length > 0 ? (
        <PageSmartBar
          title="Innehåll"
          liveHintOverride={
            contentTab === "browse" && browseMediaFiles.length > 0
              ? isMobile
                ? `${browseMediaFiles.length} mediafiler i vyn — markera det du vill använda.`
                : `${browseMediaFiles.length} mediafiler i vyn — J/K bläddra, S välj.`
              : `${selectedAssets.length} valda — gå till Skapa eller Publicera.`
          }
        />
      ) : null}

      {driveAccounts.length === 0 ? <SectionConnectionStatus area="content" className="mt-0" /> : null}

      {contentTab === "create" ? (
        <PageAiSuggestionsStrip
          businessProfileId={createBusinessProfileId}
          kinds={["content", "engagement"]}
          label="AI-idéer för innehåll"
        />
      ) : null}

      <div className="app-workspace-shell !min-h-0">
        <div className="app-workspace-toolbar overflow-x-auto px-2 py-2 sm:px-4">
      <Tabs value={contentTab} onValueChange={(value) => goToTab(value as typeof contentTab)}>
        <div className="flex w-full items-end border-b border-border">
          <TabsList className="h-auto min-w-0 flex-1 justify-start rounded-none border-0 bg-transparent p-0">
            <TabsTrigger
              value="browse"
              className="min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <HardDrive className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="sm:inline">Bläddra</span>
            </TabsTrigger>
            <TabsTrigger
              value="selected"
              className="hidden min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:inline-flex sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <BookmarkCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Valda
              {selectedAssets.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary/15 text-primary px-1.5 text-[11px] tabular-nums sm:text-[10px]">
                  {selectedAssets.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="create"
              className="hidden min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:inline-flex sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <Wand2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Skapa
            </TabsTrigger>
            <TabsTrigger
              value="publish"
              className="min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <Send className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Publicera
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="hidden min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2.5 text-sm sm:inline-flex sm:min-h-0 sm:py-2 sm:text-xs"
            >
              <History className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Historik
              {generatedHistory.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[11px] tabular-nums sm:text-[10px]">{generatedHistory.length}</span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "mb-px min-h-11 shrink-0 gap-1 rounded-none border-b-2 px-3 py-2.5 text-sm sm:hidden",
                  contentTab === "selected" || contentTab === "create" || contentTab === "history"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                )}
                aria-label="Fler flikar"
              >
                <MoreHorizontal className="h-4 w-4" />
                Mer
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => goToTab("selected")}>
                <BookmarkCheck className="mr-2 h-4 w-4" />
                Valda
                {selectedAssets.length > 0 ? (
                  <span className="ml-auto tabular-nums text-muted-foreground">{selectedAssets.length}</span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goToTab("create")}>
                <Wand2 className="mr-2 h-4 w-4" />
                Skapa
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goToTab("publish")}>
                <Send className="mr-2 h-4 w-4" />
                Publicera
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => goToTab("history")}>
                <History className="mr-2 h-4 w-4" />
                Historik
                {generatedHistory.length > 0 ? (
                  <span className="ml-auto tabular-nums text-muted-foreground">{generatedHistory.length}</span>
                ) : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Tabs>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-3 sm:p-4">

      {combinedOauthError ? (
        <OAuthErrorAlert
          details={combinedOauthError}
          message={formatOAuthErrorMessage(combinedOauthError)}
          onDismiss={() => {
            setPopupOauthError(null);
            clearOauthError();
          }}
        />
      ) : null}

      {contentTab === "create" ? (
        <div className="space-y-4">
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
              toast.success("Idé tillagd — redo att publicera eller spara");
            }}
          />
          <McpFeatureSection
            businessProfileId={createBusinessProfileId}
            featureIds={MCP_PAGE_FEATURE_IDS.content}
            title="MCP-innehållsverktyg"
            description="Generera presentationer (Gamma) eller designbriefs (Canva MCP). Koppla leverantörer under Kopplingar → MCP om status visar saknad nyckel."
          />
          <CreateTab
            businessProfileId={createBusinessProfileId}
            selectedAssets={selectedAssets}
            availableAssets={imageItems.map((file) => assetFromDriveFile(file)).filter((asset): asset is SelectedContentAsset => Boolean(asset))}
            captionHint={publishCaption}
            canvaConnected={canvaConnected}
            onToggleAssetSelection={saveAssetSelection}
            onOpenBrowse={() => goToTab("browse")}
            onOpenSelected={() => goToTab("selected")}
            onBeforeRequest={ensureBackendSession}
            onRecordGenerated={(asset, meta) => recordGeneratedAsset(asset, meta)}
            onSaveResultToSelection={(asset, meta) => {
              saveGeneratedToSelection(asset, meta);
            }}
            onContinueToPublish={() => goToTab("publish")}
            onPublishReadinessChange={setPublishReadiness}
            onBatchIngested={handleBatchIngested}
            onOpenHistory={() => goToTab("history")}
            initialCreateMode={initialCreateMode}
          />
        </div>
      ) : null}

      {contentTab === "selected" ? (
        <SelectedContentPanel
          selectedAssets={selectedAssets}
          historyItems={generatedHistory}
          onRemove={removeFromSelected}
          onRemoveMany={removeManyFromSelected}
          onClear={handleClearSelection}
          onReorder={reorderSelected}
          onAddFromHistory={(asset) => {
            saveAssetSelection(asset, true);
            toast.success("Tillagd i Valda");
          }}
          onUploadFiles={handleBrowseUploadFiles}
          uploading={uploadingBrowse}
          uploadDisabled={!createBusinessProfileId}
          onGoBrowse={() => goToTab("browse")}
          onGoHistory={() => goToTab("history")}
          onCreate={() => goToTab("create")}
          onPublish={() => goToTab("publish")}
        />
      ) : null}

      {contentTab === "history" ? (
        <GeneratedHistoryPanel
          items={generatedHistory}
          loading={historyLoading}
          selectedKeys={selectedIds}
          onAddToSelection={(asset) => {
            saveAssetSelection(asset, true);
            toast.success("Tillagd i Valda");
          }}
          onAddAllToSelection={(assets) => {
            assets.forEach((asset) => saveAssetSelection(asset, true));
            toast.success(`${assets.length} tillagda i Valda`);
            goToTab("selected");
          }}
          onRemove={removeGenerated}
          onClear={() => {
            clearGenerated();
            toast.message("Historik rensad");
          }}
        />
      ) : null}

      {contentTab === "publish" ? (
        <div className="space-y-4">
          <AutomationEnableHint
            compact
            tab="content"
            focus="publish-scheduled-posts"
            title="Schemaläggning körs automatiskt"
            description="När du schemalägger inlägg publiceras de automatiskt var 15:e minut. Innehållspipelinen kan också köa utkast åt dig."
            ctaLabel="Se content-automationer"
          />
          {selectedAssets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {generatedHistory.length > 0
                    ? "Lägg till media från Bläddra eller Historik till Valda, sedan publicera."
                    : "Välj minst en bild eller video i Bläddra eller Valda först."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => goToTab("selected")}>
                    Öppna Valda
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => goToTab("browse")}>
                    Gå till Bläddra
                  </Button>
                  {generatedHistory.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => goToTab("history")}>
                      Öppna Historik
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
          <PublishSafetyPanel
            businessProfileId={createBusinessProfileId}
            imageAssets={selectedImages}
            readiness={publishReadiness}
            onReadinessChange={setPublishReadiness}
            onBeforeRequest={ensureBackendSession}
            autoRunModeration
          />
          <PublishComposer
            initialCaption={publishCaption}
            mediaUrls={publishMediaUrls}
            onCaptionChange={setPublishCaption}
            autoSelectAccounts
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
      ) : null}

      {activeAccount && (
        <div className="space-y-3">
          {/* View tabs */}
          <Tabs
            value={driveView}
            onValueChange={(value) => {
              setDriveView(value === "shared-with-me" ? "shared-with-me" : "my-drive");
              setCurrentFolderId(null);
              setFolderStack([]);
            }}
          >
            <TabsList className="h-auto rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger
                value="my-drive"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2"
              >
                <HardDrive className="h-3.5 w-3.5" />
                Min enhet
              </TabsTrigger>
              <TabsTrigger
                value="shared-with-me"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 px-3 py-2"
              >
                <Users className="h-3.5 w-3.5" />
                Delat med mig
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
                {driveView === "shared-with-me" ? "Delat med mig" : "Min enhet"}
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
            <CardTitle className="text-base">Kopplade Drive-konton</CardTitle>
            <CardDescription>Välj vilket Google Drive-konto du vill bläddra i just nu.</CardDescription>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Google Drive</CardTitle>
          <CardDescription>
            Klicka på bilder eller videor för att lägga till i Valda
            {selectedAssets.length > 0 ? (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => goToTab("selected")}
                >
                  {selectedAssets.length} valda
                </button>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
      </Card>

      {driveAccounts.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="Ingen Google Drive kopplad ännu"
          description="Koppla Drive först — sedan kan du bläddra mappar, markera media och schemalägga publicering."
          action={
            <Button onClick={() => void connectDrive()} disabled={isConnecting}>
              {isConnecting ? "Ansluter…" : "Koppla Google Drive"}
            </Button>
          }
        />
      ) : loading ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar…
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={driveSearchRef}
                id="driveSearch"
                type="search"
                placeholder="Sök filer efter namn…"
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <input
              ref={browseUploadRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(event) => void handleBrowseUploadFiles(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingBrowse || !createBusinessProfileId}
              onClick={() => browseUploadRef.current?.click()}
            >
              {uploadingBrowse ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload files
            </Button>
          </div>
          <ContentUploadDropzone
            onFiles={handleBrowseUploadFiles}
            busy={uploadingBrowse}
            disabled={!createBusinessProfileId}
            className="py-6"
            label="Eller släpp filer här för att ladda upp till Valda"
          />
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
                          {formatShortDate(folder.modifiedTime)}
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
                  selectionKeyForFile={(file) =>
                    assetSelectionKey({ id: file.id, sourceAccountId: activeAccount?.id ?? "" })
                  }
                  onToggleAsset={toggleAsset}
                  focusedFileId={focusedBrowseFileId}
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
                  selectionKeyForFile={(file) =>
                    assetSelectionKey({ id: file.id, sourceAccountId: activeAccount?.id ?? "" })
                  }
                  onToggleAsset={toggleAsset}
                  focusedFileId={focusedBrowseFileId}
                />
              )}
            </>
          )}

          {browseMediaFiles.length > 0 ? (
            <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4 rounded-b-lg -mx-0">
              <span className="truncate">
                {focusedBrowseFile ? (
                  <>
                    Fokus:{" "}
                    <span className="font-medium text-foreground/80">{focusedBrowseFile.name}</span>
                  </>
                ) : (
                  "J/K bläddra bland bilder och videor"
                )}
              </span>
              <span className="hidden sm:inline">S Select · / Search</span>
            </div>
          ) : null}

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
                    ? `Inga filer matchar "${driveSearch.trim()}".`
                    : driveView === "shared-with-me"
                    ? "Inga filer delade med dig."
                    : providerData?.currentFolderName
                    ? `Inga filer i "${providerData.currentFolderName}".`
                    : "Inga filer i Min enhet. Prova att bläddra i en undermapp — eller byt till Delat med mig."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
        </>
      ) : null}

        </div>
      </div>

      <ContentNextStepBar
        active={contentTab}
        selectionCount={selectedAssets.length}
        historyCount={generatedHistory.length}
        onGo={goToTab}
      />
    </div>
  );
}
