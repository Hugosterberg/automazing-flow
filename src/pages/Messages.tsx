import { m } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
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
  type MailFolderSelection,
  type MailSortOrder,
  type MailViewFilter,
  MessageMailToolbar,
  MessageTriageBuckets,
  classifyMessageTriage,
  isTriageBucket,
  TRIAGE_BUCKET_LABELS,
  type TriageBucketFilter,
} from "@/features/messages";
import type { InboxPrefs } from "@/features/messages/inboxPrefs";
import { AutoReplyDraftsStrip } from "@/features/automation";
import { MailReplyDraftsStrip } from "@/features/messages/MailReplyDraftsStrip";
import { MailConnectEmptyCards } from "@/features/messages/MailConnectEmptyCards";
import { useLoadUnifiedInbox } from "@/features/messages/useLoadUnifiedInbox";
import { useMessagesKeyboardShortcuts } from "@/features/messages/useMessagesKeyboardShortcuts";
import { useMessageTriageState } from "@/features/messages/useMessageTriageState";
import { useFilteredInbox } from "@/features/messages/useFilteredInbox";
import { useMessageAiAssist } from "@/features/messages/useMessageAiAssist";
import { useMailInboxActions } from "@/features/messages/useMailInboxActions";

const MESSAGE_ACCOUNT_PLATFORMS = ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as const;

export default function MessagesPage() {
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, activeProfileId, addAccountFromOAuth, setSelectedAccountId } = useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusReplyRef = useRef<(() => void) | null>(null);
  const threadPrefetchCache = useRef<Map<string, ThreadMessage[]>>(new Map());
  const prefetchInflight = useRef<Set<string>>(new Set());
  const replyDraftCache = useRef<Map<string, string>>(new Map());
  const inboxPrefsRef = useRef<InboxPrefs>({});
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyDraft, setReplyDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [selectedMailFolder, setSelectedMailFolderState] = useState<MailFolderSelection | null>(null);
  const [includeAllMail, setIncludeAllMailState] = useState(false);
  const [mailViewFilter, setMailViewFilterState] = useState<MailViewFilter>("all");
  const [mailSort, setMailSortState] = useState<MailSortOrder>("triage");
  const [triageBucket, setTriageBucketState] = useState<TriageBucketFilter>("all");

  const inboxPrefsDoc = useProfileDocument<InboxPrefs>("messages-inbox-prefs", {});
  inboxPrefsRef.current = inboxPrefsDoc.data ?? {};
  const patchInboxPrefs = useCallback(
    (partial: Partial<InboxPrefs>) => {
      const next = { ...inboxPrefsRef.current, ...partial };
      inboxPrefsRef.current = next;
      inboxPrefsDoc.save(next);
    },
    [inboxPrefsDoc]
  );

  const {
    handledIds,
    snoozeMap,
    markHandled,
    unmarkHandled,
    markRead,
    snoozeMessage,
    isUnanswered,
    isVisuallyUnread,
  } = useMessageTriageState();

  const selectedId = searchParams.get("id");
  const selectedMessage = useMemo(
    () => (selectedId ? messages.find((m) => m.id === selectedId) ?? null : null),
    [messages, selectedId]
  );

  const { aiSummaries, draftBusy, setDraftBusy, draftReply, autoDraftForId } = useMessageAiAssist({
    messages,
    selectedMessage,
    selectedId,
    replySent,
    sendBusy,
    setReplyDraft,
  });

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
      patchInboxPrefs({ mailFolder: folder });
    },
    [patchInboxPrefs]
  );

  const setIncludeAllMail = useCallback(
    (value: boolean) => {
      setIncludeAllMailState(value);
      if (value) {
        setSelectedMailFolderState(null);
        patchInboxPrefs({ includeAllMail: true, mailFolder: null });
        return;
      }
      patchInboxPrefs({ includeAllMail: false });
    },
    [patchInboxPrefs]
  );

  const setMailViewFilter = useCallback(
    (filter: MailViewFilter) => {
      setMailViewFilterState(filter);
      patchInboxPrefs({ mailViewFilter: filter });
    },
    [patchInboxPrefs]
  );

  const setMailSort = useCallback(
    (sort: MailSortOrder) => {
      setMailSortState(sort);
      patchInboxPrefs({ mailSort: sort });
    },
    [patchInboxPrefs]
  );

  const setTriageBucket = useCallback(
    (bucket: TriageBucketFilter) => {
      setTriageBucketState(bucket);
      patchInboxPrefs({ triageBucket: bucket });
      const next = new URLSearchParams(searchParams);
      if (bucket === "all") next.delete("bucket");
      else next.set("bucket", bucket);
      setSearchParams(next, { replace: true });
    },
    [patchInboxPrefs, searchParams, setSearchParams]
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

  const { loadUnified } = useLoadUnifiedInbox({
    activeTab,
    selectedMailFolder,
    includeAllMail,
    activeProfileId,
    ensureBackendSession,
    setMessages,
    setLoading,
    setError,
    setZernioNote,
    setMailErrors,
  });

  useEffect(() => {
    function handleLiveSync() {
      void loadUnified({ silent: true });
    }
    window.addEventListener(LIVE_SYNC_MESSAGES, handleLiveSync);
    return () => window.removeEventListener(LIVE_SYNC_MESSAGES, handleLiveSync);
  }, [loadUnified]);

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
        const existingAccountIds = new Set(accountsRef.current.map((account) => account.id));
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
  }, [activeProfileId, addAccountFromOAuth, ensureBackendSession]);

  // Connections is the sole connect home — avoid parallel OAuth entry points here.

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

  const selectedMessageRef = useRef(selectedMessage);
  selectedMessageRef.current = selectedMessage;

  useEffect(() => {
    const msg = selectedMessageRef.current;
    if (!msg) {
      setThreadLoading(false);
      return;
    }
    const canLoad =
      (msg.kind === "email" && (msg.threadId || msg.providerMessageId)) ||
      (msg.kind === "dm" && msg.conversationId);
    if (!canLoad) {
      setThreadMessages([]);
      setThreadLoading(false);
      return;
    }

    const cached = threadPrefetchCache.current.get(msg.id);
    if (cached) {
      setThreadMessages(cached);
      setThreadLoading(false);
      return;
    }

    const ac = new AbortController();
    const messageId = msg.id;
    setThreadLoading(true);
    void fetchMessageThread(msg, activeProfileId, ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) {
          threadPrefetchCache.current.set(messageId, rows);
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
  }, [selectedMessage?.id, activeProfileId]);

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
    if (typeof saved?.includeAllMail === "boolean") setIncludeAllMailState(saved.includeAllMail);
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
      patchInboxPrefs({ filter });
    },
    [patchInboxPrefs]
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
        patchInboxPrefs({ tab, mailFolder: null });
        return;
      }
      patchInboxPrefs({ tab });
    },
    [patchInboxPrefs, searchParams, setSearchParams]
  );

  const hasAnyMailConnected = mailAccounts.length > 0;

  const {
    filteredMessages,
    triageCounts,
    unansweredInTab,
    inboxStats,
    inboxLiveHint,
    tabCounts,
    hasMessagesInTab,
    openTotal,
  } = useFilteredInbox({
    messages,
    activeTab,
    inboxFilter,
    debouncedInboxSearch,
    mailViewFilter,
    mailSort,
    triageBucket,
    handledIds,
    snoozeMap,
    isUnanswered,
    isVisuallyUnread,
    aiSummaries,
  });

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

  const markHandledAndAdvance = useCallback(
    (id: string) => {
      if (handledIds.has(id)) return;
      const next = pickNextAfter(id, filteredMessages);
      selectMessage(next);
      markHandled([id]);
    },
    [filteredMessages, handledIds, markHandled, pickNextAfter, selectMessage]
  );

  const {
    mailFolders,
    moveBusy,
    mailActionBusy,
    handleMailFoldersChange,
    moveMessageToMailFolder,
    performSelectedMailAction,
  } = useMailInboxActions({
    activeTab,
    selectedMailFolder,
    includeAllMail,
    activeProfileId,
    businessProfileId,
    selectedMessage,
    filteredMessages,
    pickNextAfter,
    selectMessage,
    setMessages,
  });

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
  ) : inboxEmptyState.showAutomations ? (
    <Button asChild type="button" size="sm" variant="outline" className="h-8 text-xs">
      <Link to="/automations?tab=messages&focus=auto-reply">Öppna Automationer</Link>
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

  const canReplyToSelected = Boolean(
    selectedMessage &&
      ((selectedMessage.kind === "dm" && selectedMessage.conversationId) ||
        (selectedMessage.kind === "email" && providerMessageIdFor(selectedMessage)))
  );

  useMessagesKeyboardShortcuts({
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
    searchInputRef,
    focusReplyRef,
  });

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
    draftReply,
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

      {!focusedReading && activeTab === "mail" && !hasAnyMailConnected ? <MailConnectEmptyCards /> : null}

      {!focusedReading ? (
        <div className="space-y-2">
          <AutoReplyDraftsStrip businessProfileId={businessProfileId} compact />
          <MailReplyDraftsStrip
            businessProfileId={businessProfileId}
            onUseDraft={(draft) => {
              setReplyDraft(draft);
              sonnerToast.success("Utkast infogat i svarsfältet — öppna mailet och skicka när du är nöjd.");
            }}
          />
        </div>
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
            includeAllMail={includeAllMail}
            onIncludeAllMailChange={setIncludeAllMail}
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
          onReconnectGmail={() => navigate("/connections?filter=attention&q=gmail")}
          onReconnectOutlook={() => navigate("/connections?filter=attention&q=outlook")}
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
