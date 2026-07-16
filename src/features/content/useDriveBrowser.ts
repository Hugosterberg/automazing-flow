import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountPlatform, ConnectedAccount } from "@/types/accounts";
import { apiUrl } from "@/lib/apiBase";
import { t } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/apiError";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { OAuthErrorDetails } from "@/lib/oauthErrors";
import {
  type DriveProviderData,
  type DriveOAuthPopupMessage,
} from "@/features/content/DriveMediaGrid";

type Args = {
  accounts: ConnectedAccount[];
  selectedAccountId: string | null;
  setSelectedAccountId: (section: "content", accountId: string | null) => void;
  addAccountFromOAuth: (
    accountId: string,
    platform: AccountPlatform,
    username: string,
    profileId?: string,
    extra?: {
      zernioAccountId?: string;
      profileUrl?: string;
      displayName?: string;
      isZernio?: boolean;
      switchActiveProfile?: boolean;
    }
  ) => void;
  activeBusinessProfileId: string | null | undefined;
  activeProfileId: string | null | undefined;
  ensureBackendSession: () => Promise<void>;
};

/**
 * Google Drive browse state: account sync, folder navigation, fetch, search/filter, focus.
 * Keyboard shortcuts stay on the Content page (they need selection toggle).
 */
export function useDriveBrowser({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  addAccountFromOAuth,
  activeBusinessProfileId,
  activeProfileId,
  ensureBackendSession,
}: Args) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [driveView, setDriveView] = useState<"my-drive" | "shared-with-me">("my-drive");
  const [popupOauthError, setPopupOauthError] = useState<OAuthErrorDetails | null>(null);
  const [providerData, setProviderData] = useState<DriveProviderData>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [driveSearch, setDriveSearch] = useState("");
  const [focusedBrowseFileId, setFocusedBrowseFileId] = useState<string | null>(null);
  const driveRequestIdRef = useRef(0);
  const driveSearchRef = useRef<HTMLInputElement>(null);
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const ensureBackendSessionRef = useRef(ensureBackendSession);
  useEffect(() => {
    ensureBackendSessionRef.current = ensureBackendSession;
  }, [ensureBackendSession]);

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

  const activeAccountId = activeAccount?.id ?? null;

  useEffect(() => {
    if (driveAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId("content", driveAccounts[0].id);
    }
  }, [driveAccounts, selectedAccountId, setSelectedAccountId]);

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
          throw new Error(apiErrorMessage(payload, t("content:drive.fetchFailed")));
        }
        const data = await res.json();
        if (driveRequestIdRef.current !== reqId) return;
        setProviderData(data);
      } catch (e) {
        if (driveRequestIdRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : t("content:drive.requestFailed"));
      } finally {
        if (driveRequestIdRef.current === reqId) setLoading(false);
      }
    })();
  }, [activeAccountId, activeBusinessProfileId, activeProfileId, currentFolderId, driveView, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

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

  const browseMediaFiles = useMemo(
    () => [...imageItems, ...videoItems],
    [imageItems, videoItems]
  );
  const focusedBrowseFile = useMemo(
    () => browseMediaFiles.find((file) => file.id === focusedBrowseFileId) ?? null,
    [browseMediaFiles, focusedBrowseFileId]
  );

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
        let res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${connectedParams.toString()}`), {
          credentials: "include",
        });
        if (res.status === 401) {
          await ensureBackendSession();
          res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${connectedParams.toString()}`), {
            credentials: "include",
          });
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
  }, [
    activeBusinessProfileId,
    activeProfileId,
    addAccountFromOAuth,
    selectedAccountId,
    setSelectedAccountId,
    ensureBackendSession,
  ]);

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

  return {
    driveAccounts,
    activeAccount,
    providerData,
    loading,
    error,
    refresh,
    driveSearch,
    setDriveSearch,
    driveSearchRef,
    driveView,
    handleDriveViewChange,
    folderStack,
    navigateIntoFolder,
    navigateBack,
    navigateRoot,
    navigateToBreadcrumb,
    folderItems,
    imageItems,
    videoItems,
    otherItems,
    browseMediaFiles,
    filteredActiveItems,
    driveQuery,
    focusedBrowseFileId,
    focusedBrowseFile,
    navigateBrowseFileRelative,
    popupOauthError,
    setPopupOauthError,
  };
}
