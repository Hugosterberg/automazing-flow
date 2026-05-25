import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { clearSelectedContent, loadSelectedContent, saveSelectedContent, type SelectedContentAsset } from "@/lib/contentSelection";
import { formatOAuthErrorMessage, type OAuthErrorDetails } from "@/lib/oauthErrors";
import { getOAuthProfileId } from "@/lib/oauthProfile";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { apiUrl } from "@/lib/apiBase";
import { Film, FolderOpen, Image as ImageIcon, Loader2, RefreshCw, HardDrive, Users, ChevronDown, ExternalLink, ArrowLeft } from "lucide-react";

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
  const visible = expanded ? files : files.slice(0, previewCount);
  const hidden = files.length - previewCount;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({files.length})</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {visible.map((file) => {
          const checked = selectedIds.has(file.id);
          return (
            <div
              key={file.id}
              className="group relative rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer bg-secondary/20"
              onClick={() => onToggleAsset(file, !checked)}
            >
              <div className="aspect-square bg-secondary/50 flex items-center justify-center overflow-hidden relative">
                {file.thumbnailUrl ? (
                  <img src={file.thumbnailUrl} alt={file.name} className="w-full h-full object-cover" />
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
                    className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-md bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
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
        })}
      </div>
      {files.length > previewCount && (
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Show less" : `Show ${hidden} more ${title.toLowerCase()}`}
        </button>
      )}
    </div>
  );
}

export default function ContentPage() {
  const navigate = useNavigate();
  const { authMode, session } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, addAccountFromOAuth, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const selectedAccountId = getSelectedAccountId("content");
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [driveView, setDriveView] = useState<"my-drive" | "shared-with-me">("my-drive");
  const [popupOauthError, setPopupOauthError] = useState<OAuthErrorDetails | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<SelectedContentAsset[]>(() =>
    loadSelectedContent(activeProfileId)
  );

  useEffect(() => {
    setSelectedAssets(loadSelectedContent(activeProfileId));
  }, [activeProfileId]);

  const ensureBackendSession = useCallback(async () => {
    if (authMode === "local") {
      await fetch(apiUrl("/api/auth/local-session"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
      return;
    }

    if (authMode === "cloud" && session?.access_token) {
      await fetch(apiUrl("/api/auth/session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "include",
      }).catch(() => {});
    }
  }, [authMode, session?.access_token]);

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
  const driveRequestIdRef = useRef(0);

  // Auto-select first account if nothing chosen
  useEffect(() => {
    if (driveAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId("content", driveAccounts[0].id);
    }
  }, [driveAccounts, selectedAccountId, setSelectedAccountId]);

  const ensureBackendSessionRef = useRef(ensureBackendSession);
  ensureBackendSessionRef.current = ensureBackendSession;

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
    const query = params.toString() ? `?${params.toString()}` : "";
    const url = apiUrl(`/api/accounts/${activeAccountId}/data${query}`);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let res = await fetch(url, { credentials: "include" });
        if (res.status === 401) {
          await ensureBackendSessionRef.current();
          res = await fetch(url, { credentials: "include" });
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "Could not fetch Google Drive content.");
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
  }, [activeAccountId, currentFolderId, driveView, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  // Backend always puts the relevant items in `items` — view=shared-with-me puts shared in items too
  const activeItems = providerData?.items || [];
  const folderItems = activeItems.filter((item) => item.kind === "folder");
  const imageItems = activeItems.filter((item) => item.kind === "image");
  const videoItems = activeItems.filter((item) => item.kind === "video");
  const otherItems = activeItems.filter((item) => item.kind === "other");

  const PREVIEW_COUNT = 4;
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const selectedIds = useMemo(() => new Set(selectedAssets.map((asset) => asset.id)), [selectedAssets]);
  const selectedImages = selectedAssets.filter((asset) => asset.kind === "image");
  const selectedVideos = selectedAssets.filter((asset) => asset.kind === "video");
  const combinedOauthError = popupOauthError || oauthErrorDetails;

  useEffect(() => {
    setCurrentFolderId(null);
    setFolderStack([]);
    setDriveView("my-drive");
  }, [selectedAccountId]);

  useEffect(() => {
    let ignore = false;

    async function syncDriveAccountsFromBackend() {
      try {
        let res = await fetch(apiUrl("/api/accounts/connected?platform=google_drive"), { credentials: "include" });
        if (res.status === 401) {
          await ensureBackendSession();
          res = await fetch(apiUrl("/api/accounts/connected?platform=google_drive"), { credentials: "include" });
        }
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || ignore) return;

        const backendAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
        if (backendAccounts.length === 0) return;

        for (const account of backendAccounts) {
          addAccountFromOAuth(
            String(account.account_id || ""),
            "google_drive",
            String(account.username || "Google Drive"),
            account.profile_id ? String(account.profile_id) : undefined,
            {
              displayName: account.displayName ? String(account.displayName) : undefined,
              profileUrl: account.profileUrl ? String(account.profileUrl) : undefined,
              isZernio: Boolean(account.isZernio),
              zernioAccountId: account.zernioAccountId ? String(account.zernioAccountId) : undefined,
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
  }, [addAccountFromOAuth, selectedAccountId, setSelectedAccountId, ensureBackendSession]);

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
      const healthRes = await fetch(apiUrl("/api/health"), { credentials: "include" });
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
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
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

  function toggleAsset(file: DriveBrowserItem, checked: boolean) {
    // Only image/video assets are selectable as content — folders and
    // non-media files (kind === "other") are not part of the selection model.
    if (file.kind !== "image" && file.kind !== "video") return;
    const next: SelectedContentAsset[] = checked
      ? [
          ...selectedAssets.filter((asset) => asset.id !== file.id),
          {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            kind: file.kind,
            thumbnailUrl: file.thumbnailUrl,
            previewUrl: file.previewUrl,
            webViewLink: file.webViewLink,
            sourceAccountId: activeAccount?.id || "",
            sourceAccountName: activeAccount?.username || "Google Drive",
          },
        ]
      : selectedAssets.filter((asset) => asset.id !== file.id);

    setSelectedAssets(next);
    saveSelectedContent(activeProfileId, next);
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
    setSelectedAssets([]);
    clearSelectedContent(activeProfileId);
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <PageHeader
        icon={FolderOpen}
        title="Content"
        description="Connect Google Drive, browse folders, and mark media for creation."
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

      {combinedOauthError && (
        <OAuthErrorAlert
          details={combinedOauthError}
          message={formatOAuthErrorMessage(combinedOauthError, OAUTH_MESSAGES, "Content connect failed")}
          onDismiss={() => {
            setPopupOauthError(null);
            clearOauthError();
          }}
        />
      )}

      {error && (
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
          <Button variant="outline" onClick={() => navigate("/social-media")} disabled={selectedAssets.length === 0}>
            Use in Social Media
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

          {activeItems.length === 0 && !loading && (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {driveView === "shared-with-me"
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
    </div>
  );
}
