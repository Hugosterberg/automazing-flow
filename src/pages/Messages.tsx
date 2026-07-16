import { m } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { apiJson } from "@/lib/apiJson";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { useProfileDocument } from "@/features/profile-documents";
import { UNREAD_DM_KEY } from "@/features/daily-brief/useUnreadDmCount";
import { toast as sonnerToast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFocusedWorkspaceReading, useIsMobile, useStackedWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { LIVE_SYNC_MESSAGES } from "@/lib/liveSyncEvents";
import { useVisibleIntervalRefetch } from "@/hooks/useVisibleIntervalRefetch";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import {
  MessageWorkspace,
  MessageInboxToolbar,
  MessageInboxStats,
  MessageStatusBar,
  MessageAlertsBanner,
  fetchMessageThread,
  avatarGradient,
  channelBadge,
  inboxEmptyCopy,
  formatMessageDate,
  formatFullMessageDate,
  formatWaitTime,
  isUrgentWait,
  messageMatchesTab,
  MESSAGE_TABS,
  providerMessageIdFor,
  senderInitial,
  type MessageChannelTab,
  type InboxFilter,
  type ThreadMessage,
  type UnifiedMessage,
  type MailFolder,
  type MailFolderSelection,
  type MailSortOrder,
  type MailViewFilter,
  MessageMailToolbar,
  MessageTriageBuckets,
  classifyMessageTriage,
  compareByTriage,
  countByTriageBucket,
  isTriageBucket,
  TRIAGE_BUCKET_LABELS,
  type TriageBucketFilter,
} from "@/features/messages";
import { moveMessageToFolder } from "@/features/messages/mailFoldersClient";
import { performMailAction, type MailMessageAction } from "@/features/messages/mailActionsClient";
import type { InboxPrefs } from "@/features/messages/inboxPrefs";
import {
  inboxCacheKey,
  mergeUnifiedByKind,
  readInboxCache,
  writeInboxCache,
} from "@/features/messages/inboxCache";
import {
  isSnoozed,
  pruneSnoozeMap,
  snoozeUntilNextWeek,
  snoozeUntilTomorrowMorning,
  type SnoozeMap,
} from "@/features/messages/messageSnooze";

const MESSAGE_ACCOUNT_PLATFORMS = ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as const;

/** Background refresh interval while the tab is visible. */
const INBOX_REFRESH_MS = 60_000;

/** Cap for the persisted handled-ids list so the document stays bounded. */
const MAX_HANDLED_IDS = 500;

/** Cap for the persisted read-ids list so the document stays bounded. */
const MAX_READ_IDS = 1000;

const FILTER_SHORTCUTS: Record<string, InboxFilter> = {
  q: "queue",
  o: "open",
  a: "all",
};

export default function MessagesPage() {
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, activeProfileId, addAccountFromOAuth, setSelectedAccountId } = useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zernioNote, setZernioNote] = useState<string | null>(null);
  const [mailErrors, setMailErrors] = useState<Array<{ accountId: string; platform: string; error: string }>>([]);
  const [activeTab, setActiveTab] = useState<MessageChannelTab>("mail");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("queue");
  const [inboxSearch, setInboxSearch] = useState("");
  const debouncedInboxSearch = useDebouncedValue(inboxSearch, 160);
  const defaultedFilter = useRef(false);
  /** Once the user picks a row, keep it until context changes or it leaves the list. */
  const userPickedMessage = useRef(false);
  const autoDraftForId = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusReplyRef = useRef<(() => void) | null>(null);
  const threadPrefetchCache = useRef<Map<string, ThreadMessage[]>>(new Map());
  const prefetchInflight = useRef<Set<string>>(new Set());
  const replyDraftCache = useRef<Map<string, string>>(new Map());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyDraft, setReplyDraft] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [selectedMailFolder, setSelectedMailFolderState] = useState<MailFolderSelection | null>(null);
  const [mailFolders, setMailFolders] = useState<MailFolder[]>([]);
  const [moveBusy, setMoveBusy] = useState(false);
  const [mailActionBusy, setMailActionBusy] = useState(false);
  const [mailViewFilter, setMailViewFilterState] = useState<MailViewFilter>("all");
  const [mailSort, setMailSortState] = useState<MailSortOrder>("triage");
  const [triageBucket, setTriageBucketState] = useState<TriageBucketFilter>("all");

  // "Handled" is app-level triage (the providers don't expose mark-as-read):
  // handled ids stop counting as unanswered in this inbox. Persisted per
  // profile so the state follows the user across devices.
  const handledDoc = useProfileDocument<string[]>("messages-handled", []);
  const snoozeDoc = useProfileDocument<SnoozeMap>("messages-snoozed", {});
  const inboxPrefsDoc = useProfileDocument<InboxPrefs>("messages-inbox-prefs", {});
  const handledIds = useMemo(
    () => new Set(Array.isArray(handledDoc.data) ? handledDoc.data : []),
    [handledDoc.data]
  );
  const snoozeMap = useMemo(
    () => pruneSnoozeMap(snoozeDoc.data && typeof snoozeDoc.data === "object" ? snoozeDoc.data : {}),
    [snoozeDoc.data]
  );
  const snoozeMessage = useCallback(
    (id: string, until: "tomorrow" | "week") => {
      const untilIso = until === "week" ? snoozeUntilNextWeek() : snoozeUntilTomorrowMorning();
      const next = pruneSnoozeMap({ ...snoozeMap, [id]: untilIso });
      snoozeDoc.save(next);
      sonnerToast.success(until === "week" ? "Uppskjutet till nästa vecka" : "Uppskjutet till imorgon");
    },
    [snoozeDoc, snoozeMap]
  );
  const markHandled = useCallback(
    (ids: string[], opts?: { silent?: boolean }) => {
      const fresh = ids.filter((id) => !handledIds.has(id));
      if (fresh.length === 0) return;
      const prev = Array.isArray(handledDoc.data) ? handledDoc.data : [];
      const next = [...prev, ...fresh].slice(-MAX_HANDLED_IDS);
      handledDoc.save(next);
      if (opts?.silent) return;
      if (fresh.length === 1) {
        sonnerToast.success("Markerad som hanterad", {
          action: { label: "Ångra", onClick: () => handledDoc.save(prev) },
        });
      } else {
        sonnerToast.success(`${fresh.length} meddelanden markerade som hanterade`);
      }
    },
    [handledDoc, handledIds]
  );
  const unmarkHandled = useCallback(
    (ids: string[]) => {
      const remove = new Set(ids);
      const prev = Array.isArray(handledDoc.data) ? handledDoc.data : [];
      const next = prev.filter((id) => !remove.has(id));
      if (next.length === prev.length) return;
      handledDoc.save(next);
      sonnerToast.success("Meddelandet är öppet igen");
    },
    [handledDoc]
  );

  // Providers don't expose mark-as-read either, so track locally which
  // unread messages have been opened in the reading pane: keeps the inbox
  // list's unread badge/bold state in sync with what the user has actually
  // seen, instead of only clearing once a message is explicitly "Handled".
  const readDoc = useProfileDocument<string[]>("messages-read", []);
  const readIds = useMemo(
    () => new Set(Array.isArray(readDoc.data) ? readDoc.data : []),
    [readDoc.data]
  );
  const markRead = useCallback(
    (id: string) => {
      if (readIds.has(id)) return;
      const prev = Array.isArray(readDoc.data) ? readDoc.data : [];
      readDoc.save([...prev, id].slice(-MAX_READ_IDS));
    },
    [readDoc, readIds]
  );
  const isUnanswered = useCallback(
    // Stay in the open/queue until explicitly marked handled — opening to read
    // must not empty the triage list (local readIds only softens the unread badge).
    (msg: UnifiedMessage) => msg.isUnread && !handledIds.has(msg.id),
    [handledIds]
  );

  const isVisuallyUnread = useCallback(
    (msg: UnifiedMessage) => msg.isUnread && !handledIds.has(msg.id) && !readIds.has(msg.id),
    [handledIds, readIds]
  );

  const selectedId = searchParams.get("id");
  const selectedMessage = useMemo(
    () => (selectedId ? messages.find((m) => m.id === selectedId) ?? null : null),
    [messages, selectedId]
  );

  const selectMessage = useCallback(
    (msg: UnifiedMessage | null, opts?: { fromUser?: boolean }) => {
      if (opts?.fromUser) userPickedMessage.current = Boolean(msg);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (msg) next.set("id", msg.id);
          else next.delete("id");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selectMessageFromUser = useCallback(
    (msg: UnifiedMessage | null) => selectMessage(msg, { fromUser: true }),
    [selectMessage]
  );

  const mailAccounts = useMemo(
    () => accounts.filter((a) => (a.platform === "gmail" || a.platform === "outlook") && a.isOAuth),
    [accounts]
  );

  const mailFolderAccounts = useMemo(
    () =>
      mailAccounts.map((account) => ({
        id: account.id,
        label: account.displayName || account.username || (account.platform === "gmail" ? "Gmail" : "Outlook"),
        platform: account.platform as "gmail" | "outlook",
      })),
    [mailAccounts]
  );

  const setSelectedMailFolder = useCallback(
    (folder: MailFolderSelection | null) => {
      setSelectedMailFolderState(folder);
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, mailFolder: folder });
    },
    [inboxPrefsDoc]
  );

  const setMailViewFilter = useCallback(
    (filter: MailViewFilter) => {
      setMailViewFilterState(filter);
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, mailViewFilter: filter });
    },
    [inboxPrefsDoc]
  );

  const setMailSort = useCallback(
    (sort: MailSortOrder) => {
      setMailSortState(sort);
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, mailSort: sort });
    },
    [inboxPrefsDoc]
  );

  const setTriageBucket = useCallback(
    (bucket: TriageBucketFilter) => {
      setTriageBucketState(bucket);
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, triageBucket: bucket });
      const next = new URLSearchParams(searchParams);
      if (bucket === "all") next.delete("bucket");
      else next.set("bucket", bucket);
      setSearchParams(next, { replace: true });
    },
    [inboxPrefsDoc, searchParams, setSearchParams]
  );

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

  const loadUnified = useCallback(async (opts?: { silent?: boolean }) => {
    const folderScoped = activeTab === "mail" && selectedMailFolder;
    const cacheKey = inboxCacheKey({
      businessProfileId: activeProfileId,
      mailAccountId: folderScoped ? selectedMailFolder.accountId : null,
      mailFolderId: folderScoped ? selectedMailFolder.folderId : null,
    });

    if (!opts?.silent) {
      setError(null);
      setZernioNote(null);
      setMailErrors([]);
      const cached = readInboxCache(cacheKey);
      if (cached && cached.length > 0) {
        // Show last known inbox immediately while fresh data loads.
        setMessages(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }

    const baseParams = new URLSearchParams();
    if (activeProfileId) baseParams.set("business_profile_id", activeProfileId);
    if (folderScoped && selectedMailFolder) {
      baseParams.set("mailAccountId", selectedMailFolder.accountId);
      baseParams.set("mailFolderId", selectedMailFolder.folderId);
    }

    async function fetchSources(sources: "mail" | "dm") {
      const params = new URLSearchParams(baseParams);
      params.set("sources", sources);
      const unifiedUrl = apiUrl(`/api/messages/unified?${params.toString()}`);
      let res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
      if (res.status === 401) {
        await ensureBackendSession();
        res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(d, "Kunde inte ladda meddelanden."));
      }
      return res.json() as Promise<{
        messages?: UnifiedMessage[];
        mailErrors?: Array<{ accountId: string; platform: string; error: string }>;
        zernioNote?: string;
      }>;
    }

    try {
      // Phase 1 — mail first (provider list is now lightweight metadata).
      const mailData = await fetchSources("mail");
      const mailMsgs = Array.isArray(mailData.messages) ? mailData.messages : [];
      setMessages((prev) => {
        const next = mergeUnifiedByKind(prev, mailMsgs, "email");
        writeInboxCache(cacheKey, next);
        return next;
      });
      if (Array.isArray(mailData.mailErrors) && mailData.mailErrors.length > 0) {
        setMailErrors(mailData.mailErrors);
      }
      if (!opts?.silent) setLoading(false);

      // Phase 2 — DMs after mail is visible (skip when viewing a specific mail folder).
      if (!folderScoped) {
        try {
          const dmData = await fetchSources("dm");
          const dmMsgs = Array.isArray(dmData.messages) ? dmData.messages : [];
          setMessages((prev) => {
            const next = mergeUnifiedByKind(prev, dmMsgs, "dm");
            writeInboxCache(cacheKey, next);
            return next;
          });
          if (typeof dmData.zernioNote === "string" && dmData.zernioNote) {
            setZernioNote(dmData.zernioNote);
          }
        } catch {
          /* Keep mail rows if DM fetch fails. */
        }
      }
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "Något gick fel");
        if (!readInboxCache(cacheKey)?.length) setMessages([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [ensureBackendSession, activeProfileId, activeTab, selectedMailFolder]);

  useEffect(() => {
    function handleLiveSync() {
      void loadUnified({ silent: true });
    }
    window.addEventListener(LIVE_SYNC_MESSAGES, handleLiveSync);
    return () => window.removeEventListener(LIVE_SYNC_MESSAGES, handleLiveSync);
  }, [loadUnified]);

  useVisibleIntervalRefetch(() => void loadUnified({ silent: true }), INBOX_REFRESH_MS);

  useEffect(() => {
    void loadUnified();
  }, [loadUnified]);

  useEffect(() => {
    function handleOauthSuccess(event: Event) {
      const detail = (event as CustomEvent<{ platform?: string }>).detail;
      if (detail?.platform && (MESSAGE_ACCOUNT_PLATFORMS as readonly string[]).includes(detail.platform)) {
        void loadUnified();
      }
    }

    window.addEventListener("automazing:oauth-success", handleOauthSuccess);
    return () => window.removeEventListener("automazing:oauth-success", handleOauthSuccess);
  }, [loadUnified]);

  useEffect(() => {
    let ignore = false;

    async function syncMailAccountsFromBackend() {
      try {
        await ensureBackendSession();
        const platforms = MESSAGE_ACCOUNT_PLATFORMS;
        const existingAccountIds = new Set(accounts.map((account) => account.id));
        for (const platform of platforms) {
          const params = new URLSearchParams({ platform });
          if (activeProfileId) params.set("business_profile_id", activeProfileId);
          let res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${params.toString()}`), { credentials: "include" });
          if (res.status === 401) {
            await ensureBackendSession();
            res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${params.toString()}`), { credentials: "include" });
          }
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || ignore) continue;

          const backendAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
          for (const account of backendAccounts) {
            const accountId = String(account.account_id || "");
            if (!accountId || existingAccountIds.has(accountId)) continue;
            existingAccountIds.add(accountId);
            addAccountFromOAuth(
              accountId,
              platform,
              String(account.username || (platform === "gmail" ? "Gmail" : platform === "outlook" ? "Outlook" : platform)),
              account.profile_id ? String(account.profile_id) : undefined,
              {
                displayName: account.displayName ? String(account.displayName) : undefined,
                isZernio: Boolean(account.isZernio),
                zernioAccountId: account.zernioAccountId ? String(account.zernioAccountId) : undefined,
                // Background hydration must not flip the active profile.
                switchActiveProfile: false,
              }
            );
          }
        }
      } catch {
        // Best-effort hydration only.
      }
    }

    void syncMailAccountsFromBackend();
    return () => {
      ignore = true;
    };
  }, [accounts, activeProfileId, addAccountFromOAuth, ensureBackendSession]);

  async function connectGmail() {
    await ensureBackendSession();
    const params = new URLSearchParams();
    appendOAuthProfileParams(params, activeProfileId);
    params.set("app_origin", window.location.origin);
    window.location.href = `${apiUrl("/api/auth/gmail")}?${params}`;
  }

  async function connectOutlook() {
    await ensureBackendSession();
    const params = new URLSearchParams();
    appendOAuthProfileParams(params, activeProfileId);
    params.set("app_origin", window.location.origin);
    window.location.href = `${apiUrl("/api/auth/outlook")}?${params}`;
  }

  // Restore reply draft cache and reset transient state when switching messages.
  useEffect(() => {
    if (!selectedMessage?.id) return;
    const cached = replyDraftCache.current.get(selectedMessage.id);
    setReplyDraft(cached ?? "");
    setReplySent(false);
    setDraftBusy(false);
    setSendBusy(false);
    // Prefer cached thread; otherwise keep prior body visible until the new
    // fetch lands (avoid blanking the reading pane on every J/K hop).
    const threadCached = threadPrefetchCache.current.get(selectedMessage.id);
    if (threadCached) {
      setThreadMessages(threadCached);
      setThreadLoading(false);
    } else {
      // Avoid briefly showing the previous message's thread under the new selection.
      setThreadMessages([]);
    }
    autoDraftForId.current = cached?.trim() ? selectedMessage.id : null;
  }, [selectedMessage?.id]);

  // Opening a message counts as seen for the unread badge, but the item stays
  // in the open queue until Klar / send / archive.
  useEffect(() => {
    if (!selectedMessage?.id || !selectedMessage.isUnread) return;
    markRead(selectedMessage.id);
  }, [selectedMessage?.id, selectedMessage?.isUnread, markRead]);

  useEffect(() => {
    if (!selectedMessage?.id || replySent) return;
    if (replyDraft.trim()) replyDraftCache.current.set(selectedMessage.id, replyDraft);
    else replyDraftCache.current.delete(selectedMessage.id);
  }, [replyDraft, replySent, selectedMessage?.id]);

  useEffect(() => {
    if (!selectedMessage) {
      setThreadLoading(false);
      return;
    }
    const canLoad =
      (selectedMessage.kind === "email" &&
        (selectedMessage.threadId || selectedMessage.providerMessageId)) ||
      (selectedMessage.kind === "dm" && selectedMessage.conversationId);
    if (!canLoad) {
      setThreadMessages([]);
      setThreadLoading(false);
      return;
    }

    const cached = threadPrefetchCache.current.get(selectedMessage.id);
    if (cached) {
      setThreadMessages(cached);
      setThreadLoading(false);
      return;
    }

    const ac = new AbortController();
    setThreadLoading(true);
    void fetchMessageThread(selectedMessage, activeProfileId, ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) {
          threadPrefetchCache.current.set(selectedMessage.id, rows);
          setThreadMessages(rows);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setThreadMessages([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setThreadLoading(false);
      });

    return () => ac.abort();
  }, [selectedMessage, activeProfileId]);

  const prefetchThread = useCallback(
    (msg: UnifiedMessage) => {
      if (threadPrefetchCache.current.has(msg.id) || prefetchInflight.current.has(msg.id)) return;
      const canLoad =
        (msg.kind === "email" && (msg.threadId || msg.providerMessageId)) ||
        (msg.kind === "dm" && msg.conversationId);
      if (!canLoad) return;
      prefetchInflight.current.add(msg.id);
      void fetchMessageThread(msg, activeProfileId)
        .then((rows) => {
          threadPrefetchCache.current.set(msg.id, rows);
          prefetchInflight.current.delete(msg.id);
        })
        .catch(() => prefetchInflight.current.delete(msg.id));
    },
    [activeProfileId]
  );

  useEffect(() => {
    if (defaultedFilter.current || loading || inboxPrefsDoc.isLoading) return;
    defaultedFilter.current = true;
    const saved = inboxPrefsDoc.data;
    const urlTab = searchParams.get("tab");
    const channelFromUrl =
      urlTab && MESSAGE_TABS.some((t) => t.value === urlTab)
        ? (urlTab as MessageChannelTab)
        : null;
    if (channelFromUrl) setActiveTab(channelFromUrl);
    else if (saved?.tab) setActiveTab(saved.tab);
    if (saved?.mailFolder) setSelectedMailFolderState(saved.mailFolder);
    if (saved?.mailViewFilter) setMailViewFilterState(saved.mailViewFilter);
    if (saved?.mailSort) setMailSortState(saved.mailSort);
    const urlBucket = searchParams.get("bucket");
    if (isTriageBucket(urlBucket)) setTriageBucketState(urlBucket);
    else if (saved?.triageBucket) setTriageBucketState(saved.triageBucket);
    if (saved?.filter) {
      setInboxFilter(saved.filter);
      return;
    }
    const unread = messages.filter(isUnanswered).length;
    if (unread > 0) setInboxFilter("queue");
  }, [loading, messages, isUnanswered, inboxPrefsDoc.isLoading, inboxPrefsDoc.data, searchParams]);

  const setInboxFilterPersisted = useCallback(
    (filter: InboxFilter) => {
      setInboxFilter(filter);
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, filter });
    },
    [inboxPrefsDoc]
  );

  const setActiveTabPersisted = useCallback(
    (tab: MessageChannelTab) => {
      setActiveTab(tab);
      const next = new URLSearchParams(searchParams);
      if (tab === "mail") next.delete("tab");
      else next.set("tab", tab);
      setSearchParams(next, { replace: true });
      if (tab !== "mail") {
        setSelectedMailFolderState(null);
        inboxPrefsDoc.save({ ...inboxPrefsDoc.data, tab, mailFolder: null });
        return;
      }
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, tab });
    },
    [inboxPrefsDoc, searchParams, setSearchParams]
  );

  const removeMessageFromInbox = useCallback(
    (messageId: string) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    },
    []
  );

  const handleMailFoldersChange = useCallback((folders: MailFolder[]) => {
    setMailFolders(folders);
  }, []);

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (!selectedMessage || draftBusy || sendBusy || replySent) return;
    if (autoDraftForId.current === selectedMessage.id) return;
    const text = (selectedMessage.body || selectedMessage.snippet || "").trim();
    if (!text) return;
    // On phones/tablets, wait for an explicit AI tap so reading stays calm.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      return;
    }
    // Debounce so rapid J/K navigation doesn't spam AI draft requests.
    const messageId = selectedMessage.id;
    const authorName = selectedMessage.from.name || selectedMessage.subject;
    const kind = selectedMessage.kind === "email" ? "email" : "dm";
    const bodyText = selectedMessage.body || selectedMessage.snippet;
    const timer = window.setTimeout(() => {
      if (autoDraftForId.current === messageId) return;
      if (selectedIdRef.current !== messageId) return;
      autoDraftForId.current = messageId;
      void draftReplyFor(messageId, kind, authorName, bodyText);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [selectedMessage?.id, draftBusy, sendBusy, replySent]);

  async function draftReplyFor(
    forId: string,
    kind: "email" | "dm",
    authorName: string,
    text: string
  ) {
    setDraftBusy(true);
    try {
      const payload = await apiJson<{ draft?: unknown }>("/api/ai/reply-draft", "Kunde inte skapa AI-utkast", {
        body: { kind, authorName, text },
      });
      if (selectedIdRef.current !== forId) return;
      setReplyDraft(String(payload?.draft || ""));
    } catch (e) {
      if (selectedIdRef.current !== forId) return;
      toast({
        title: "AI-utkast misslyckades",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setDraftBusy(false);
    }
  }

  async function draftReply() {
    if (!selectedMessage) return;
    autoDraftForId.current = selectedMessage.id;
    await draftReplyFor(
      selectedMessage.id,
      selectedMessage.kind === "email" ? "email" : "dm",
      selectedMessage.from.name || selectedMessage.subject,
      selectedMessage.body || selectedMessage.snippet
    );
  }

  const summaryPayload = useMemo(
    () =>
      messages.slice(0, 20).map((m) => ({
        id: m.id,
        subject: m.subject,
        snippet: m.snippet,
        from: m.from,
      })),
    [messages]
  );

  useEffect(() => {
    if (summaryPayload.length === 0) {
      setAiSummaries({});
      return;
    }
    const ac = new AbortController();
      void fetchWithTimeout(apiUrl("/api/messages/summaries"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: summaryPayload }),
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("summary_failed"))))
      .then((d) => {
        if (d && typeof d.summaries === "object") setAiSummaries(d.summaries);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [summaryPayload]);

  const hasAnyMailConnected = mailAccounts.length > 0;
  const filteredMessages = useMemo(() => {
    const q = debouncedInboxSearch.trim().toLowerCase();
    const rows = messages
      .filter((msg) => messageMatchesTab(msg, activeTab))
      .filter((msg) => {
        if (inboxFilter === "open") return isUnanswered(msg);
        if (inboxFilter === "handled") return handledIds.has(msg.id);
        return true;
      })
      .filter((msg) => {
        // Snoozed messages leave the work queues until they resurface.
        if (inboxFilter === "handled" || inboxFilter === "all") return true;
        return !isSnoozed(snoozeMap, msg.id);
      })
      .filter((msg) => {
        if (activeTab !== "mail" || mailViewFilter === "all") return true;
        if (mailViewFilter === "unread") return isVisuallyUnread(msg);
        if (mailViewFilter === "starred") return Boolean(msg.isStarred);
        return true;
      })
      .filter((msg) => {
        if (triageBucket === "all") return true;
        return classifyMessageTriage(msg).bucket === triageBucket;
      })
      .filter((msg) => {
        if (!q) return true;
        const haystack = [
          msg.subject,
          msg.from.name,
          msg.from.email,
          msg.snippet,
          msg.body,
          msg.accountLabel,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    return rows.sort((a, b) => {
      if (mailSort === "newest" || mailSort === "oldest") {
        const aDate = Date.parse(a.date) || 0;
        const bDate = Date.parse(b.date) || 0;
        return mailSort === "oldest" ? aDate - bDate : bDate - aDate;
      }
      // Default "triage": action buckets first, then open-before-handled.
      const triageCmp = compareByTriage(a, b);
      if (triageCmp !== 0) return triageCmp;
      const aOpen = isUnanswered(a);
      const bOpen = isUnanswered(b);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return 0;
    });
  }, [
    activeTab,
    messages,
    inboxFilter,
    debouncedInboxSearch,
    isUnanswered,
    isVisuallyUnread,
    handledIds,
    mailViewFilter,
    mailSort,
    triageBucket,
    snoozeMap,
  ]);

  const triageCounts = useMemo(() => {
    const inTab = messages
      .filter((msg) => messageMatchesTab(msg, activeTab))
      .filter((msg) => {
        if (inboxFilter === "open") return isUnanswered(msg);
        if (inboxFilter === "handled") return handledIds.has(msg.id);
        if (inboxFilter === "queue") return true;
        return true;
      });
    return countByTriageBucket(inTab);
  }, [messages, activeTab, inboxFilter, isUnanswered, handledIds]);

  useEffect(() => {
    const q = searchParams.get("search");
    if (!q) return;
    setInboxSearch(q);
    const next = new URLSearchParams(searchParams);
    next.delete("search");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const navigateRelative = useCallback(
    (delta: number) => {
      if (filteredMessages.length === 0) return;
      const currentIndex = selectedId
        ? filteredMessages.findIndex((m) => m.id === selectedId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : filteredMessages.length - 1
          : Math.min(filteredMessages.length - 1, Math.max(0, currentIndex + delta));
      selectMessage(filteredMessages[nextIndex] ?? null, { fromUser: true });
    },
    [filteredMessages, selectedId, selectMessage]
  );

  const selectedIndex = useMemo(
    () => (selectedId ? filteredMessages.findIndex((m) => m.id === selectedId) : -1),
    [filteredMessages, selectedId]
  );

  const unansweredInTab = useMemo(
    () => messages.filter((msg) => messageMatchesTab(msg, activeTab) && isUnanswered(msg)),
    [messages, activeTab, isUnanswered]
  );

  const inboxStats = useMemo(() => {
    const open = unansweredInTab;
    let oldestWait: string | null = null;
    if (open.length > 0) {
      const oldest = open.reduce((a, b) => (Date.parse(a.date) < Date.parse(b.date) ? a : b));
      oldestWait = formatWaitTime(oldest.date);
    }
    const aiReadyCount = open.filter((m) => Boolean(aiSummaries[m.id])).length;
    return { openCount: open.length, oldestWait, aiReadyCount };
  }, [unansweredInTab, aiSummaries]);

  const inboxLiveHint = useMemo(() => {
    if (triageCounts.today > 0) {
      return `${triageCounts.today} att svara idag · ${triageCounts.week} denna vecka · filtrera hinkarna ovanför listan`;
    }
    if (inboxStats.openCount === 0) return null;
    const parts = [`${inboxStats.openCount} öppna i inkorgen`];
    if (inboxStats.oldestWait) parts.push(`äldsta väntar ${inboxStats.oldestWait}`);
    if (inboxStats.aiReadyCount > 0) parts.push(`${inboxStats.aiReadyCount} med AI-utkast klara`);
    return parts.join(" · ");
  }, [inboxStats, triageCounts]);

  const pickNextAfter = useCallback(
    (fromId: string, list: UnifiedMessage[]) => {
      const idx = list.findIndex((m) => m.id === fromId);
      if (idx === -1) {
        return list.find((m) => isUnanswered(m) && m.id !== fromId) ?? list.find((m) => m.id !== fromId) ?? null;
      }
      return (
        list.slice(idx + 1).find((m) => isUnanswered(m) && m.id !== fromId) ??
        list.slice(0, idx).find((m) => isUnanswered(m) && m.id !== fromId) ??
        list.slice(idx + 1).find((m) => m.id !== fromId) ??
        list.slice(0, idx).find((m) => m.id !== fromId) ??
        null
      );
    },
    [isUnanswered]
  );

  const advanceToNextMessage = useCallback(
    (fromId: string) => {
      selectMessage(pickNextAfter(fromId, filteredMessages));
    },
    [filteredMessages, pickNextAfter, selectMessage]
  );

  const dismissMailAndAdvance = useCallback(
    (messageId: string) => {
      const next = pickNextAfter(messageId, filteredMessages);
      // Select next before removing so the "missing id" effect never clears selection.
      selectMessage(next);
      removeMessageFromInbox(messageId);
    },
    [filteredMessages, pickNextAfter, removeMessageFromInbox, selectMessage]
  );

  const markHandledAndAdvance = useCallback(
    (id: string) => {
      if (handledIds.has(id)) return;
      const next = pickNextAfter(id, filteredMessages);
      selectMessage(next);
      markHandled([id]);
    },
    [filteredMessages, handledIds, markHandled, pickNextAfter, selectMessage]
  );

  const moveMessageToMailFolder = useCallback(
    async (folderId: string) => {
      if (!selectedMessage || selectedMessage.kind !== "email") return;
      const providerMessageId = providerMessageIdFor(selectedMessage);
      if (!providerMessageId) {
        sonnerToast.error("Kunde inte flytta — saknar meddelande-id hos leverantören.");
        return;
      }
      setMoveBusy(true);
      try {
        await moveMessageToFolder({
          accountId: selectedMessage.accountId,
          messageId: providerMessageId,
          folderId,
          businessProfileId,
        });
        sonnerToast.success("Mailet flyttades till mappen.");
        dismissMailAndAdvance(selectedMessage.id);
      } catch (error) {
        sonnerToast.error(error instanceof Error ? error.message : "Kunde inte flytta mailet.");
      } finally {
        setMoveBusy(false);
      }
    },
    [businessProfileId, dismissMailAndAdvance, selectedMessage]
  );

  const performSelectedMailAction = useCallback(
    async (action: MailMessageAction) => {
      if (!selectedMessage || selectedMessage.kind !== "email") return;
      const providerMessageId = providerMessageIdFor(selectedMessage);
      if (!providerMessageId) {
        sonnerToast.error("Kunde inte utföra åtgärden — saknar meddelande-id.");
        return;
      }
      setMailActionBusy(true);
      try {
        const result = await performMailAction({
          accountId: selectedMessage.accountId,
          messageId: providerMessageId,
          action,
          businessProfileId,
        });
        if (action === "delete") {
          sonnerToast.success("Mailet raderades.");
          dismissMailAndAdvance(selectedMessage.id);
        } else if (action === "archive") {
          sonnerToast.success("Mailet arkiverades.");
          dismissMailAndAdvance(selectedMessage.id);
        } else if (action === "flag" || action === "unflag") {
          const starred = result.starred ?? action === "flag";
          setMessages((prev) =>
            prev.map((msg) => (msg.id === selectedMessage.id ? { ...msg, isStarred: starred } : msg))
          );
          sonnerToast.success(starred ? "Mailet flaggades." : "Flaggan togs bort.");
        }
      } catch (error) {
        sonnerToast.error(error instanceof Error ? error.message : "Kunde inte utföra åtgärden.");
      } finally {
        setMailActionBusy(false);
      }
    },
    [businessProfileId, dismissMailAndAdvance, selectedMessage]
  );

  const navigateOpenRelative = useCallback(
    (delta: number) => {
      const openRows = filteredMessages.filter(isUnanswered);
      if (openRows.length === 0) return;
      const currentIndex = selectedId ? openRows.findIndex((m) => m.id === selectedId) : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : openRows.length - 1
          : Math.min(openRows.length - 1, Math.max(0, currentIndex + delta));
      selectMessage(openRows[nextIndex] ?? null);
    },
    [filteredMessages, isUnanswered, selectedId, selectMessage]
  );

  const jumpToOldestOpen = useCallback(() => {
    if (unansweredInTab.length === 0) return;
    const oldest = unansweredInTab.reduce((a, b) => (Date.parse(a.date) < Date.parse(b.date) ? a : b));
    setInboxFilterPersisted("open");
    selectMessage(oldest);
  }, [selectMessage, setInboxFilterPersisted, unansweredInTab]);

  const jumpToAiReady = useCallback(() => {
    const withAi = unansweredInTab.filter((m) => Boolean(aiSummaries[m.id]));
    if (withAi.length === 0) return;
    setInboxFilterPersisted("open");
    selectMessage(withAi[0] ?? null);
  }, [aiSummaries, selectMessage, setInboxFilterPersisted, unansweredInTab]);

  const startTriage = useCallback(() => {
    if (unansweredInTab.length === 0) return;
    setInboxFilterPersisted("open");
    jumpToOldestOpen();
  }, [jumpToOldestOpen, setInboxFilterPersisted, unansweredInTab.length]);

  const focusNextOpen = useCallback(() => {
    const openRows = filteredMessages.filter(isUnanswered);
    if (openRows.length === 0) return;
    const idx = selectedId ? openRows.findIndex((m) => m.id === selectedId) : -1;
    const next = openRows[(idx + 1) % openRows.length];
    selectMessage(next ?? null);
  }, [filteredMessages, isUnanswered, selectedId, selectMessage]);

  const cycleTab = useCallback(
    (delta: number) => {
      const idx = MESSAGE_TABS.findIndex((t) => t.value === activeTab);
      const next = MESSAGE_TABS[(idx + delta + MESSAGE_TABS.length) % MESSAGE_TABS.length];
      if (next) setActiveTabPersisted(next.value);
    },
    [activeTab, setActiveTabPersisted]
  );

  const selectFirstSearchResult = useCallback(() => {
    if (filteredMessages.length === 0) return;
    selectMessage(filteredMessages[0] ?? null, { fromUser: true });
    searchInputRef.current?.blur();
  }, [filteredMessages, selectMessage]);

  const sendReply = useCallback(async () => {
    if (!selectedMessage || !replyDraft.trim()) return;
    const messageId = providerMessageIdFor(selectedMessage);
    if (selectedMessage.kind === "email" && !messageId) {
      toast({
        title: "Kunde inte skicka svar",
        description: "E-postmeddelandet saknar provider-id. Uppdatera inkorgen och försök igen.",
        variant: "destructive",
      });
      return;
    }
    if (selectedMessage.kind === "dm" && !selectedMessage.conversationId) return;
    const sentId = selectedMessage.id;
    const nextAfterSend = pickNextAfter(sentId, filteredMessages);
    setSendBusy(true);
    try {
      await apiJson("/api/messages/reply", "Kunde inte skicka svar", {
        body: {
          accountId: selectedMessage.accountId,
          conversationId: selectedMessage.kind === "dm" ? selectedMessage.conversationId : undefined,
          messageId: selectedMessage.kind === "email" ? messageId : undefined,
          message: replyDraft.trim(),
          business_profile_id: selectedMessage.profileId || activeProfileId,
        },
      });
      setReplySent(true);
      replyDraftCache.current.delete(sentId);
      selectMessage(nextAfterSend);
      markHandled([sentId], { silent: true });
      void queryClient.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      sonnerToast.success(
        selectedMessage.kind === "email"
          ? `Svar skickat via ${selectedMessage.channel === "gmail" ? "Gmail" : "Outlook"}`
          : "Svar skickat"
      );
    } catch (e) {
      toast({
        title: "Kunde inte skicka svar",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setSendBusy(false);
    }
  }, [
    activeProfileId,
    filteredMessages,
    markHandled,
    pickNextAfter,
    queryClient,
    replyDraft,
    selectMessage,
    selectedMessage,
    toast,
  ]);

  const getRowMeta = useCallback(
    (msg: UnifiedMessage) => {
      const triage = classifyMessageTriage(msg);
      const showTriageChip = triage.bucket === "today" || triage.bucket === "week";
      return {
        open: isUnanswered(msg),
        visuallyUnread: isVisuallyUnread(msg),
        waited: isUnanswered(msg) ? formatWaitTime(msg.date) : null,
        urgent:
          (isUnanswered(msg) && isUrgentWait(msg.date)) ||
          (isUnanswered(msg) && triage.bucket === "today"),
        channelLabel: channelBadge(msg),
        triageLabel: showTriageChip ? TRIAGE_BUCKET_LABELS[triage.bucket] : null,
        aiSummary: aiSummaries[msg.id],
        formattedDate: formatMessageDate(msg.date),
        fullDate: formatFullMessageDate(msg.date),
        senderInitial: senderInitial(msg.from.name || msg.from.email),
        avatarGradient: avatarGradient(msg.from.name || msg.from.email || msg.id),
        isHandled: handledIds.has(msg.id),
      };
    },
    [aiSummaries, handledIds, isUnanswered, isVisuallyUnread]
  );

  const tabCounts = useMemo(
    () =>
      MESSAGE_TABS.reduce(
        (acc, tab) => {
          const rows = messages.filter((msg) => messageMatchesTab(msg, tab.value));
          acc[tab.value] = {
            total: rows.length,
            unread: rows.filter(isUnanswered).length,
          };
          return acc;
        },
        {} as Record<MessageChannelTab, { total: number; unread: number }>
      ),
    [messages, isUnanswered]
  );
  const hasMessagesInTab = useMemo(
    () => messages.some((msg) => messageMatchesTab(msg, activeTab)),
    [messages, activeTab]
  );

  const inboxEmptyState = useMemo(
    () =>
      inboxEmptyCopy({
        tab: activeTab,
        filter: inboxFilter,
        search: debouncedInboxSearch,
        hasMessagesInTab,
      }),
    [activeTab, debouncedInboxSearch, hasMessagesInTab, inboxFilter]
  );

  const inboxEmptyAction = inboxEmptyState.showClearSearch ? (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInboxSearch("")}>
      Rensa sökning
    </Button>
  ) : triageBucket !== "all" && hasMessagesInTab && filteredMessages.length === 0 && !debouncedInboxSearch.trim() ? (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTriageBucket("all")}>
      Visa alla hinkar
    </Button>
  ) : inboxFilter !== "all" && hasMessagesInTab && filteredMessages.length === 0 && !debouncedInboxSearch.trim() ? (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInboxFilterPersisted("all")}>
      Visa alla meddelanden
    </Button>
  ) : inboxEmptyState.showConnect ? (
    <Button asChild type="button" size="sm" variant="outline" className="h-8 text-xs">
      <Link to="/connections">Öppna Kopplingar</Link>
    </Button>
  ) : undefined;

  const showZernioNote = activeTab !== "mail" && Boolean(zernioNote);

  useEffect(() => {
    if (!selectedId || loading) return;
    if (messages.some((m) => m.id === selectedId)) return;
    // Message was removed (archive/delete) — clear so desktop auto-picks the new top.
    userPickedMessage.current = false;
    selectMessage(null);
  }, [loading, messages, selectedId, selectMessage]);

  useEffect(() => {
    if (!selectedMessage) return;
    if (messageMatchesTab(selectedMessage, activeTab)) return;
    userPickedMessage.current = false;
    selectMessage(null);
  }, [activeTab, selectedMessage, selectMessage]);

  useEffect(() => {
    userPickedMessage.current = false;
  }, [activeTab, activeProfileId, selectedMailFolder, inboxFilter, mailViewFilter, mailSort]);

  // Desktop: always show the top list row on the right until the user picks another.
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) return;
    if (filteredMessages.length === 0) {
      if (selectedId) selectMessage(null);
      return;
    }
    const stillInList = Boolean(selectedId && filteredMessages.some((m) => m.id === selectedId));
    if (userPickedMessage.current && stillInList) return;
    const top = filteredMessages[0];
    if (top && top.id !== selectedId) selectMessage(top);
  }, [
    loading,
    filteredMessages,
    selectedId,
    selectMessage,
    activeTab,
    selectedMailFolder,
    inboxFilter,
    mailViewFilter,
    mailSort,
  ]);

  const canReplyToSelected =
    selectedMessage &&
    ((selectedMessage.kind === "dm" && selectedMessage.conversationId) ||
      (selectedMessage.kind === "email" && providerMessageIdFor(selectedMessage)));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;

      if (e.shiftKey && (e.key === "j" || e.key === "ArrowDown")) {
        e.preventDefault();
        navigateOpenRelative(1);
        return;
      }
      if (e.shiftKey && (e.key === "k" || e.key === "ArrowUp")) {
        e.preventDefault();
        navigateOpenRelative(-1);
        return;
      }
      if (!e.shiftKey && (e.key === "j" || e.key === "ArrowDown")) {
        e.preventDefault();
        navigateRelative(1);
        return;
      }
      if (!e.shiftKey && (e.key === "k" || e.key === "ArrowUp")) {
        e.preventDefault();
        navigateRelative(-1);
        return;
      }
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        focusNextOpen();
        return;
      }
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleTab(-1);
        return;
      }
      if (e.key === "]" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleTab(1);
        return;
      }
      if (matchesKey(e, "h") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        if (selectedMessage && !handledIds.has(selectedMessage.id)) {
          markHandledAndAdvance(selectedMessage.id);
        }
        return;
      }
      if (matchesKey(e, "z") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        if (selectedMessage && !handledIds.has(selectedMessage.id)) {
          snoozeMessage(selectedMessage.id, e.shiftKey ? "week" : "tomorrow");
          const next = pickNextAfter(selectedMessage.id, filteredMessages);
          selectMessage(next, { fromUser: true });
        }
        return;
      }
      if (matchesKey(e, "e") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        if (selectedMessage?.kind === "email" && !mailActionBusy) {
          void performSelectedMailAction("archive");
        }
        return;
      }
      const filterShortcut = FILTER_SHORTCUTS[e.key.toLowerCase()];
      if (filterShortcut && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setInboxFilterPersisted(filterShortcut);
        return;
      }
      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        selectMessage(null);
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (matchesKey(e, "r") && isPlainLetterShortcut(e) && selectedMessage && canReplyToSelected) {
        e.preventDefault();
        focusReplyRef.current?.();
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canReplyToSelected,
    cycleTab,
    filteredMessages,
    focusNextOpen,
    handledIds,
    mailActionBusy,
    markHandledAndAdvance,
    navigateOpenRelative,
    navigateRelative,
    performSelectedMailAction,
    pickNextAfter,
    selectMessage,
    selectedId,
    selectedMessage,
    setInboxFilterPersisted,
    snoozeMessage,
  ]);

  const detailProps = useMemo(() => {
    if (!selectedMessage) return null;
    return {
      channelLabel: channelBadge(selectedMessage),
      aiSummary: aiSummaries[selectedMessage.id],
      threadMessages,
      threadLoading,
      replyDraft,
      onReplyDraftChange: setReplyDraft,
      draftBusy,
      sendBusy,
      replySent,
      canReply: Boolean(canReplyToSelected),
      isHandled: handledIds.has(selectedMessage.id),
      needsAttention: isUnanswered(selectedMessage),
      focusReplyRef,
      onDraftReply: () => void draftReply(),
      onSendReply: () => void sendReply(),
      onMarkHandled: () => markHandledAndAdvance(selectedMessage.id),
      onUnmarkHandled: handledIds.has(selectedMessage.id)
        ? () => unmarkHandled([selectedMessage.id])
        : undefined,
      onSnooze: !handledIds.has(selectedMessage.id)
        ? (until) => {
            snoozeMessage(selectedMessage.id, until);
            const next = pickNextAfter(selectedMessage.id, filteredMessages);
            selectMessage(next, { fromUser: true });
          }
        : undefined,
      onNextAfterSend: () => advanceToNextMessage(selectedMessage.id),
      onBack: () => selectMessage(null, { fromUser: true }),
      mailFolders: selectedMessage.kind === "email" ? mailFolders : undefined,
      onMoveToFolder: selectedMessage.kind === "email" ? moveMessageToMailFolder : undefined,
      moveBusy,
      onMailAction: selectedMessage.kind === "email" ? performSelectedMailAction : undefined,
      mailActionBusy,
      navigation:
        filteredMessages.length > 1 && selectedIndex >= 0
          ? {
              index: selectedIndex,
              total: filteredMessages.length,
              hasPrev: selectedIndex > 0,
              hasNext: selectedIndex < filteredMessages.length - 1,
              onPrev: () => navigateRelative(-1),
              onNext: () => navigateRelative(1),
            }
          : undefined,
    };
  }, [
    advanceToNextMessage,
    aiSummaries,
    canReplyToSelected,
    draftBusy,
    filteredMessages,
    handledIds,
    isUnanswered,
    markHandledAndAdvance,
    mailFolders,
    mailActionBusy,
    moveBusy,
    moveMessageToMailFolder,
    navigateRelative,
    performSelectedMailAction,
    pickNextAfter,
    replyDraft,
    replySent,
    selectMessage,
    selectedIndex,
    selectedMessage,
    sendBusy,
    sendReply,
    snoozeMessage,
    threadLoading,
    threadMessages,
    unmarkHandled,
  ]);

  const openTotal = useMemo(
    () => messages.filter((msg) => messageMatchesTab(msg, activeTab) && isUnanswered(msg)).length,
    [messages, activeTab, isUnanswered]
  );

  const isMobile = useIsMobile();
  const isStackedWorkspace = useStackedWorkspace();
  const focusedReading = useFocusedWorkspaceReading(Boolean(selectedMessage));

  const oauthAlertMessage = oauthErrorDetails
    ? formatOAuthErrorMessage(oauthErrorDetails)
    : null;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1520px] min-w-0 flex-col overflow-x-hidden",
        focusedReading ? "gap-0" : "gap-3 sm:gap-4"
      )}
    >
      {!focusedReading ? (
        <>
          <PageHeader
            icon={MessageSquare}
            title="Meddelanden"
            description={
              isMobile
                ? "Välj ett meddelande — AI hjälper dig sammanfatta och svara."
                : "Mail, DM och WhatsApp · J/K bläddra · H Klar · E arkivera · R svara"
            }
          />

          {inboxStats.openCount === 0 || triageCounts.today > 0 || triageCounts.week > 0 ? (
            <PageSmartBar
              title={
                triageCounts.today + triageCounts.week > 0
                  ? "Triage först — svara Idag, parkera Brus."
                  : isMobile
                    ? "Inkorgen är ikapp — koppla fler kanaler eller vänta på nya meddelanden."
                    : "Meddelanden är din triage-inkorg — när något dyker upp: läs, svara och markera Klar."
              }
              steps={
                triageCounts.today + triageCounts.week > 0
                  ? undefined
                  : isMobile
                    ? ["Välj kanal (Mail, IG, FB, WA)", "Tryck ett meddelande för att läsa", "Skicka svar eller markera klar"]
                    : [
                        "Välj kanal och triage-hink (Idag / Vecka / FYI / Brus)",
                        "J/K bläddra · H Klar · E arkivera · R svara",
                        "AI sammanfattar och skriver utkast — du godkänner innan du skickar",
                      ]
              }
              tip={
                triageCounts.today + triageCounts.week > 0
                  ? undefined
                  : "Öppna meddelanden stannar i kön tills du trycker Klar (H)."
              }
              liveHintOverride={inboxLiveHint}
              extraActions={
                triageCounts.today > 0
                  ? [{ label: "Visa Idag", onClick: () => setTriageBucket("today") }]
                  : []
              }
            />
          ) : null}
        </>
      ) : null}

      {!focusedReading && activeTab === "mail" && !hasAnyMailConnected ? (
        <m.div {...fadeUp} transition={{ duration: 0.35 }} className="grid gap-3 sm:grid-cols-2">
          <Card className="border-dashed border-border bg-card/40">
            <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Gmail</p>
                <p className="mt-1 text-xs text-muted-foreground">Koppla för att se mail i inkorgen.</p>
              </div>
              <Button size="sm" className="glow-sm" onClick={() => void connectGmail()}>
                Koppla Gmail
              </Button>
            </CardContent>
          </Card>
          <Card className="border-dashed border-border bg-card/40">
            <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Outlook</p>
                <p className="mt-1 text-xs text-muted-foreground">Koppla Microsoft 365 / Outlook.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void connectOutlook()}>
                Koppla Outlook
              </Button>
            </CardContent>
          </Card>
        </m.div>
      ) : null}

      <m.div
        {...fadeUp}
        transition={{ duration: 0.35, delay: focusedReading ? 0 : 0.03 }}
        className={cn(
          "app-workspace-shell messages-workspace-shell flex flex-col",
          focusedReading && "workspace-reading-focus rounded-none border-0 shadow-none"
        )}
      >
        {!focusedReading ? (
        <MessageInboxToolbar
          activeTab={activeTab}
          onTabChange={setActiveTabPersisted}
          tabCounts={tabCounts}
          inboxSearch={inboxSearch}
          onSearchChange={setInboxSearch}
          onSearchSubmit={selectFirstSearchResult}
          searchInputRef={searchInputRef}
          inboxFilter={inboxFilter}
          onInboxFilterChange={setInboxFilterPersisted}
          unansweredCount={unansweredInTab.length}
          totalVisible={filteredMessages.length}
          openTotal={openTotal}
          loading={loading}
          onRefresh={() => void loadUnified({ silent: true })}
          onMarkAllHandled={() => markHandled(unansweredInTab.map((msg) => msg.id))}
          markAllDisabled={unansweredInTab.length === 0}
          onToggleAiSearch={() => setAiSearchOpen((v) => !v)}
          aiSearchOpen={aiSearchOpen}
          isSearching={Boolean(debouncedInboxSearch.trim())}
        />
        ) : null}

        {!focusedReading && activeTab === "mail" && mailFolderAccounts.length > 0 ? (
          <MessageMailToolbar
            mailAccounts={mailFolderAccounts}
            selectedFolder={selectedMailFolder}
            onSelectFolder={setSelectedMailFolder}
            mailViewFilter={mailViewFilter}
            onMailViewFilterChange={setMailViewFilter}
            mailSort={mailSort}
            onMailSortChange={setMailSort}
            businessProfileId={businessProfileId}
            disabled={loading}
            onFoldersChange={handleMailFoldersChange}
          />
        ) : null}

        {!focusedReading && hasMessagesInTab ? (
          <MessageTriageBuckets
            value={triageBucket}
            counts={triageCounts}
            onChange={setTriageBucket}
          />
        ) : null}

        {!focusedReading && oauthErrorDetails ? (
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={oauthAlertMessage ?? formatOAuthErrorMessage(oauthErrorDetails)}
            onDismiss={clearOauthError}
            platform={searchParams.get("platform")}
          />
        ) : null}

        {!focusedReading || error || mailErrors.length > 0 ? (
        <MessageAlertsBanner
          error={error}
          onDismissError={() => setError(null)}
          mailErrors={mailErrors}
          onReconnectGmail={() => void connectGmail()}
          onReconnectOutlook={() => void connectOutlook()}
          zernioNote={zernioNote}
          showZernioNote={showZernioNote}
        />
        ) : null}

        {!focusedReading && inboxStats.openCount > 0 ? (
        <MessageInboxStats
          openCount={inboxStats.openCount}
          oldestWait={inboxStats.oldestWait}
          aiReadyCount={inboxStats.aiReadyCount}
          loading={loading}
          onShowOpen={() => setInboxFilterPersisted("open")}
          onJumpToOldest={jumpToOldestOpen}
          onShowAiReady={jumpToAiReady}
          onStartTriage={startTriage}
        />
        ) : null}

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <MessageWorkspace
            filteredMessages={filteredMessages}
            selectedMessage={selectedMessage}
            selectedId={selectedId}
            loading={loading}
            error={error}
            inboxFilter={inboxFilter}
            searchQuery={debouncedInboxSearch}
            emptyTitle={inboxEmptyState.title}
            emptyDescription={inboxEmptyState.description}
            emptyAction={inboxEmptyAction}
            getRowMeta={getRowMeta}
            onSelect={selectMessageFromUser}
            onMarkHandled={markHandledAndAdvance}
            onPrefetch={prefetchThread}
            detailProps={detailProps}
          />
        </div>

        {!isStackedWorkspace ? (
        <MessageStatusBar
          selectedLabel={
            selectedMessage
              ? selectedMessage.subject || selectedMessage.from.name || selectedMessage.from.email
              : null
          }
        />
        ) : null}

        <Collapsible open={aiSearchOpen} onOpenChange={setAiSearchOpen}>
          <CollapsibleContent className="border-t border-border/60 bg-muted/10 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <div className="p-4">
              <McpFeatureSection
                businessProfileId={businessProfileId}
                featureIds={MCP_PAGE_FEATURE_IDS.messages}
                title="AI-mailsökning"
                description="Sök i kopplad mail via MCP när OAuth är konfigurerat."
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.06 }}>
        <SectionConnectionStatus area="messages" className="rounded-xl border-border/60" />
      </m.div>

      {authMode === "local" ? (
        <p className="text-xs text-muted-foreground">
          Lokalt läge — OAuth fungerar för test och data sparas i sessionen.
        </p>
      ) : null}
    </div>
  );
}
