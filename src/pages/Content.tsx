import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccountData } from "@/hooks/useAccountData";
import { clearSelectedContent, loadSelectedContent, saveSelectedContent, type SelectedContentAsset } from "@/lib/contentSelection";
import { formatOAuthErrorMessage, type OAuthErrorDetails } from "@/lib/oauthErrors";
import { getOAuthProfileId } from "@/lib/oauthProfile";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { Film, FolderOpen, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";

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
  currentFolderId?: string | null;
  currentFolderName?: string | null;
  parentFolderId?: string | null;
  usedFallback?: boolean;
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
  google_drive_not_configured: "Google Drive is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
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

export default function ContentPage() {
  const navigate = useNavigate();
  const { authMode, session } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, addAccountFromOAuth, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const selectedAccountId = getSelectedAccountId("content");
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [popupOauthError, setPopupOauthError] = useState<OAuthErrorDetails | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<SelectedContentAsset[]>(() =>
    loadSelectedContent(activeProfileId)
  );

  useEffect(() => {
    setSelectedAssets(loadSelectedContent(activeProfileId));
  }, [activeProfileId]);

  async function ensureBackendSession() {
    if (authMode === "local") {
      await fetch("/api/auth/local-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
      return;
    }

    if (authMode === "cloud" && session?.access_token) {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "include",
      }).catch(() => {});
    }
  }

  const {
    scopedAccounts: driveAccounts,
    activeAccount,
    data: providerData,
    loading,
    error,
    refresh,
  } = useAccountData<DriveProviderData>({
    accounts,
    selectedAccountId,
    setSelectedAccountId: (id) => setSelectedAccountId("content", id),
    accountFilter: (a) => a.platform === "google_drive" && Boolean(a.isOAuth),
    initialData: null,
    fetcher: async (accountId) => {
      const query = currentFolderId ? `?folderId=${encodeURIComponent(currentFolderId)}` : "";
      let res = await fetch(`/api/accounts/${accountId}/data${query}`, { credentials: "include" });
      if (res.status === 401) {
        await ensureBackendSession();
        res = await fetch(`/api/accounts/${accountId}/data${query}`, { credentials: "include" });
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not fetch Google Drive content.");
      }
      return res.json();
    },
  });

  const items = providerData?.items || [];
  const folderItems = items.filter((item) => item.kind === "folder");
  const mediaItems = items.filter((item) => item.kind === "image" || item.kind === "video");
  const otherItems = items.filter((item) => item.kind === "other");
  const selectedIds = useMemo(() => new Set(selectedAssets.map((asset) => asset.id)), [selectedAssets]);
  const selectedImages = selectedAssets.filter((asset) => asset.kind === "image");
  const selectedVideos = selectedAssets.filter((asset) => asset.kind === "video");
  const combinedOauthError = popupOauthError || oauthErrorDetails;

  useEffect(() => {
    setCurrentFolderId(null);
  }, [selectedAccountId]);

  useEffect(() => {
    let ignore = false;

    async function syncDriveAccountsFromBackend() {
      try {
        let res = await fetch("/api/accounts/connected?platform=google_drive", { credentials: "include" });
        if (res.status === 401) {
          await ensureBackendSession();
          res = await fetch("/api/accounts/connected?platform=google_drive", { credentials: "include" });
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
  }, [addAccountFromOAuth, selectedAccountId, setSelectedAccountId, authMode, session?.access_token]);

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
      const healthRes = await fetch("/api/health", { credentials: "include" });
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
      `/api/auth/google_drive${query}`,
      "google-drive-oauth",
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top}`
    );

    if (!popup) {
      params.delete("popup");
      const fallbackQuery = params.toString() ? `?${params.toString()}` : "";
      window.location.href = `/api/auth/google_drive${fallbackQuery}`;
      return;
    }

    popup.focus();
  }

  function toggleAsset(file: DriveBrowserItem, checked: boolean) {
    if (file.kind === "folder") return;
    const next = checked
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

  function handleClearSelection() {
    setSelectedAssets([]);
    clearSelectedContent(activeProfileId);
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content</h1>
          <p className="text-muted-foreground mt-1">Connect Google Drive, browse folders, and mark media for creation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void connectDrive()} disabled={isConnecting}>
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FolderOpen className="h-4 w-4 mr-2" />}
            Connect Google Drive
          </Button>
          {activeAccount && (
            <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          )}
        </div>
      </div>

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
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Active Google Drive connection</CardTitle>
            <CardDescription>
              Connected as {activeAccount.username}. Browse folders and mark media from this Drive account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant={currentFolderId ? "outline" : "default"} size="sm" onClick={() => setCurrentFolderId(null)}>
              Root
            </Button>
            {providerData?.parentFolderId && (
              <Button variant="outline" size="sm" onClick={() => setCurrentFolderId(providerData.parentFolderId)}>
                Up one folder
              </Button>
            )}
            {providerData?.currentFolderName && (
              <span className="text-sm text-muted-foreground">Current folder: {providerData.currentFolderName}</span>
            )}
            {providerData?.usedFallback && !providerData?.currentFolderName && (
              <span className="text-sm text-muted-foreground">
                Root looked empty, so showing recent folders and media from across Drive instead.
              </span>
            )}
          </CardContent>
        </Card>
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
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground mb-2">No Google Drive account connected yet.</p>
            <p className="text-sm text-muted-foreground/80">Connect Drive first, then you can browse folders and mark media here.</p>
          </CardContent>
        </Card>
      ) : loading && items.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Google Drive content...
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Folders</h2>
              <p className="text-sm text-muted-foreground">Open a folder to browse its contents in Google Drive.</p>
            </div>
            {folderItems.length === 0 ? (
              <Card className="bg-card border-border border-dashed">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No folders found in this location.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {folderItems.map((folder) => (
                  <Card key={folder.id} className="bg-card border-border">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                          <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{folder.name}</p>
                          {folder.modifiedTime && (
                            <p className="text-xs text-muted-foreground/80 mt-1">
                              Updated {new Date(folder.modifiedTime).toLocaleString("sv-SE")}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setCurrentFolderId(folder.id)}>
                        Open folder
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Media</h2>
              <p className="text-sm text-muted-foreground">Images and videos in the current folder.</p>
            </div>
            {mediaItems.length === 0 ? (
              <Card className="bg-card border-border border-dashed">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No images or videos found in this folder.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {mediaItems.map((file) => {
                  const checked = selectedIds.has(file.id);
                  return (
                    <Card key={file.id} className="bg-card border-border overflow-hidden">
                      <div className="aspect-video bg-secondary/50 flex items-center justify-center overflow-hidden">
                        {file.thumbnailUrl ? (
                          <img src={file.thumbnailUrl} alt={file.name} className="w-full h-full object-cover" />
                        ) : file.kind === "video" ? (
                          <Film className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleAsset(file, Boolean(value))}
                            aria-label={`Select ${file.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.kind === "image" ? "Image" : "Video"}
                              {file.ownerName ? ` · ${file.ownerName}` : ""}
                              {file.size ? ` · ${formatBytes(file.size)}` : ""}
                            </p>
                            {file.modifiedTime && (
                              <p className="text-xs text-muted-foreground/80 mt-1">
                                Updated {new Date(file.modifiedTime).toLocaleString("sv-SE")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {file.webViewLink && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">Open in Drive</a>
                            </Button>
                          )}
                          <Button
                            variant={checked ? "default" : "secondary"}
                            size="sm"
                            onClick={() => toggleAsset(file, !checked)}
                          >
                            {checked ? "Marked" : "Mark for creation"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Other files</h2>
              <p className="text-sm text-muted-foreground">
                Other items in this folder that are not images or videos.
              </p>
            </div>
            {otherItems.length === 0 ? (
              <Card className="bg-card border-border border-dashed">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No other files found in this folder.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {otherItems.map((file) => (
                  <Card key={`${file.id}-${file.name}`} className="bg-card border-border">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 overflow-hidden">
                          {file.iconLink ? (
                            <img src={file.iconLink} alt="" className="h-5 w-5 object-contain" />
                          ) : (
                            <FolderOpen className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.mimeType}
                            {file.isShortcut ? " · Shortcut" : ""}
                          </p>
                          {file.modifiedTime && (
                            <p className="text-xs text-muted-foreground/80 mt-1">
                              Updated {new Date(file.modifiedTime).toLocaleString("sv-SE")}
                            </p>
                          )}
                        </div>
                      </div>
                      {file.webViewLink && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">Open in Drive</a>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 && (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-6 text-sm text-muted-foreground">
                This location returned no folders or files from Google Drive.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
