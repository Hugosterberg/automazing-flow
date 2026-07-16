import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadSelectedContent, saveSelectedContent, assetSelectionKey, type SelectedContentAsset } from "@/lib/contentSelection";
import { fetchProducts } from "@/lib/productsApi";
import { useProfileDocument } from "@/features/profile-documents";
import { formatOAuthErrorMessage, type OAuthErrorDetails } from "@/lib/oauthErrors";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageAiSuggestionsStrip } from "@/features/ai-recommendations/PageAiSuggestionsStrip";
import { AutomationEnableHint } from "@/features/automation";
import { PublishComposer } from "@/features/content/PublishComposer";
import { CreateTab } from "@/features/content/CreateTab";
import type { ApiaiBatchIngestItem } from "@/features/content/apiaiClient";
import { ContentNextStepBar } from "@/features/content/ContentNextStepBar";
import { isContentTab, type ContentTab } from "@/features/content/contentFlow";
import { SelectedContentPanel } from "@/features/content/SelectedContentPanel";
import { ContentIdeasHub } from "@/features/content/ContentIdeasHub";
import { GeneratedHistoryPanel } from "@/features/content/GeneratedHistoryPanel";
import { useGeneratedContentHistory } from "@/features/content/useGeneratedContentHistory";
import { PublishSafetyPanel } from "@/features/content/PublishSafetyPanel";
import { publishBlockReason, type PublishReadiness } from "@/features/content/apiaiResultInsights";
import { publishMediaUrlsFromAssets } from "@/features/content/contentPublishMedia";
import { uploadContentMedia } from "@/features/content/contentMediaClient";
import { enqueueContentPipelineItems } from "@/features/content/contentPipelineQueue";
import { DriveBrowsePanel } from "@/features/content/DriveBrowsePanel";
import { apiUrl } from "@/lib/apiBase";
import { consumeContentCaption } from "@/lib/contentCaptionHandoff";
import { FolderOpen, History, Loader2, RefreshCw, HardDrive, ChevronDown, Wand2, Send, BookmarkCheck, MoreHorizontal } from "lucide-react";
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
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import {
  type DriveBrowserItem,
  type DriveProviderData,
  type DriveOAuthPopupMessage,
} from "@/features/content/DriveMediaGrid";

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

  const [focusedBrowseFileId, setFocusedBrowseFileId] = useState<string | null>(null);
  const [uploadingBrowse, setUploadingBrowse] = useState(false);
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

  function navigateRoot() {
    setFolderStack([]);
    setCurrentFolderId(null);
  }

  function navigateToBreadcrumb(index: number) {
    const newStack = folderStack.slice(0, index + 1);
    setFolderStack(newStack);
    setCurrentFolderId(newStack[newStack.length - 1].id);
  }

  function handleDriveViewChange(view: "my-drive" | "shared-with-me") {
    setDriveView(view);
    setCurrentFolderId(null);
    setFolderStack([]);
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
            {driveAccounts.length === 0 ? (
              <Button asChild variant="outline">
                <Link to="/connections?q=drive">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Öppna Kopplingar
                </Link>
              </Button>
            ) : null}
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
        <DriveBrowsePanel
          error={error}
          onRetry={() => void refresh()}
          activeAccountId={activeAccount?.id ?? null}
          driveView={driveView}
          onDriveViewChange={handleDriveViewChange}
          folderStack={folderStack}
          onNavigateBack={navigateBack}
          onNavigateRoot={navigateRoot}
          onNavigateToBreadcrumb={navigateToBreadcrumb}
          onNavigateIntoFolder={navigateIntoFolder}
          driveAccounts={driveAccounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={(accountId) => setSelectedAccountId("content", accountId)}
          selectedCount={selectedAssets.length}
          onGoSelected={() => goToTab("selected")}
          loading={loading}
          driveSearch={driveSearch}
          onDriveSearchChange={setDriveSearch}
          driveSearchRef={driveSearchRef}
          onUploadFiles={handleBrowseUploadFiles}
          uploading={uploadingBrowse}
          uploadDisabled={!createBusinessProfileId}
          folderItems={folderItems}
          imageItems={imageItems}
          videoItems={videoItems}
          otherItems={otherItems}
          browseMediaFiles={browseMediaFiles}
          filteredActiveItems={filteredActiveItems}
          driveQuery={driveQuery}
          providerData={providerData}
          selectedIds={selectedIds}
          onToggleAsset={toggleAsset}
          focusedFileId={focusedBrowseFileId}
          focusedFile={focusedBrowseFile}
        />
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
