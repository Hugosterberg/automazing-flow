import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { useProfileDocument } from "@/features/profile-documents";
import { toast as sonnerToast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFocusedWorkspaceReading, useIsMobile, useStackedWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { LIVE_SYNC_MESSAGES } from "@/lib/liveSyncEvents";
import {
  MessageWorkspace,
  MessageInboxToolbar,
  MessageInboxStats,
  MessageStatusBar,
  MessageAlertsBanner,
  avatarGradient,
  channelBadge,
  inboxEmptyCopy,
  formatMessageDate,
  formatFullMessageDate,
  formatWaitTime,
  isUrgentWait,
  MESSAGE_TABS,
  providerMessageIdFor,
  senderInitial,
  type MessageChannelTab,
  type InboxFilter,
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
import { MessagePageChrome } from "@/features/messages/MessagePageChrome";
import { useLoadUnifiedInbox } from "@/features/messages/useLoadUnifiedInbox";
import { useMessagesKeyboardShortcuts } from "@/features/messages/useMessagesKeyboardShortcuts";
import { useMessageTriageState } from "@/features/messages/useMessageTriageState";
import { useFilteredInbox } from "@/features/messages/useFilteredInbox";
import { useMessageAiAssist } from "@/features/messages/useMessageAiAssist";
import { useMailInboxActions } from "@/features/messages/useMailInboxActions";
import { useMessageThread } from "@/features/messages/useMessageThread";
import { useMessageReply } from "@/features/messages/useMessageReply";
import { useSyncMessageAccounts, MESSAGE_ACCOUNT_PLATFORMS } from "@/features/messages/useSyncMessageAccounts";
import { useMessageDetailProps } from "@/features/messages/useMessageDetailProps";
import { useMessageAutoSelection } from "@/features/messages/useMessageAutoSelection";
import { mergeDemoInboxMessages, useDemoMode } from "@/features/demo";

export default function MessagesPage() {
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, activeProfileId, addAccountFromOAuth } = useAccounts();
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
  const inboxPrefsRef = useRef<InboxPrefs>({});
  const filteredMessagesRef = useRef<UnifiedMessage[]>([]);
  const pickNextAfterRef = useRef<(fromId: string, list: UnifiedMessage[]) => UnifiedMessage | null>(
    () => null
  );
  const onDraftRestoredRef = useRef<(messageId: string, cachedDraft: string | null) => void>(() => {});
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [selectedMailFolder, setSelectedMailFolderState] = useState<MailFolderSelection | null>(null);
  const [includeAllMail, setIncludeAllMailState] = useState(false);
  const [mailViewFilter, setMailViewFilterState] = useState<MailViewFilter>("all");
  const [mailSort, setMailSortState] = useState<MailSortOrder>("triage");
  const [triageBucket, setTriageBucketState] = useState<TriageBucketFilter>("all");

  const inboxPrefsDoc = useProfileDocument<InboxPrefs>("messages-inbox-prefs", {});
  // Latest-ref: patchInboxPrefs merges against the freshest prefs without
  // re-creating itself when the document reloads. Synced in an effect.
  useEffect(() => {
    inboxPrefsRef.current = inboxPrefsDoc.data ?? {};
  }, [inboxPrefsDoc.data]);
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

  const { enabled: demoEnabled } = useDemoMode();
  const inboxMessages = useMemo(
    () => mergeDemoInboxMessages(messages, demoEnabled),
    [messages, demoEnabled]
  );

  const selectedId = searchParams.get("id");
  const selectedMessage = useMemo(
    () => (selectedId ? inboxMessages.find((m) => m.id === selectedId) ?? null : null),
    [inboxMessages, selectedId]
  );

  const { threadMessages, threadLoading, prefetchThread } = useMessageThread({
    selectedMessage,
    activeProfileId,
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

  const { replyDraft, setReplyDraft, sendBusy, replySent, sendReply } = useMessageReply({
    selectedMessage,
    activeProfileId,
    getFilteredMessages: () => filteredMessagesRef.current,
    pickNextAfter: (fromId, list) => pickNextAfterRef.current(fromId, list),
    selectMessage,
    markHandled,
    onDraftRestored: (messageId, cached) => onDraftRestoredRef.current(messageId, cached),
  });

  const { aiSummaries, draftBusy, setDraftBusy, draftReply, autoDraftForId } = useMessageAiAssist({
    messages: inboxMessages,
    selectedMessage,
    selectedId,
    replySent,
    sendBusy,
    setReplyDraft,
  });
  // Wired via ref because useMessageReply is created above, before the AI
  // assist hook exists. Only stable values are captured, so syncing in an
  // effect (instead of during render) changes nothing behaviorally.
  useEffect(() => {
    onDraftRestoredRef.current = (messageId, cached) => {
      setDraftBusy(false);
      autoDraftForId.current = cached?.trim() ? messageId : null;
    };
  }, [setDraftBusy, autoDraftForId]);

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

  useSyncMessageAccounts({
    accounts,
    activeProfileId,
    ensureBackendSession,
    addAccountFromOAuth,
  });

  // Connections is the sole connect home — avoid parallel OAuth entry points here.

  // Opening a message counts as seen for the unread badge, but the item stays
  // in the open queue until Klar / send / archive.
  useEffect(() => {
    if (!selectedMessage?.id || !selectedMessage.isUnread) return;
    markRead(selectedMessage.id);
  }, [selectedMessage?.id, selectedMessage?.isUnread, markRead]);

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
    const unread = inboxMessages.filter(isUnanswered).length;
    if (unread > 0) setInboxFilter("queue");
  }, [loading, inboxMessages, isUnanswered, inboxPrefsDoc.isLoading, inboxPrefsDoc.data, searchParams]);

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
    messages: inboxMessages,
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
  // Latest-ref for send-time reads (see useMessageReply's getFilteredMessages).
  useEffect(() => {
    filteredMessagesRef.current = filteredMessages;
  }, [filteredMessages]);

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
  // Latest-ref for send-time reads (see useMessageReply's pickNextAfter).
  useEffect(() => {
    pickNextAfterRef.current = pickNextAfter;
  }, [pickNextAfter]);

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
      {t("messages:empty.clearSearch")}
    </Button>
  ) : triageBucket !== "all" && hasMessagesInTab && filteredMessages.length === 0 && !debouncedInboxSearch.trim() ? (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTriageBucket("all")}>
      {t("messages:empty.showAllBuckets")}
    </Button>
  ) : inboxFilter !== "all" && hasMessagesInTab && filteredMessages.length === 0 && !debouncedInboxSearch.trim() ? (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInboxFilterPersisted("all")}>
      {t("messages:empty.showAllMessages")}
    </Button>
  ) : inboxEmptyState.showAutomations ? (
    <Button asChild type="button" size="sm" variant="outline" className="h-8 text-xs">
      <Link to="/automations?tab=messages&focus=auto-reply">{t("messages:empty.openAutomations")}</Link>
    </Button>
  ) : inboxEmptyState.showConnect ? (
    <Button asChild type="button" size="sm" variant="outline" className="h-8 text-xs">
      <Link to="/connections">{t("messages:empty.openConnections")}</Link>
    </Button>
  ) : undefined;

  const showZernioNote = activeTab !== "mail" && Boolean(zernioNote);

  useMessageAutoSelection({
    loading,
    messages: inboxMessages,
    selectedId,
    selectedMessage,
    activeTab,
    activeProfileId,
    selectedMailFolder,
    inboxFilter,
    mailViewFilter,
    mailSort,
    filteredMessages,
    selectMessage,
    userPickedMessage,
  });

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

  const detailProps = useMessageDetailProps({
    selectedMessage,
    aiSummaries,
    threadMessages,
    threadLoading,
    replyDraft,
    setReplyDraft,
    draftBusy,
    sendBusy,
    replySent,
    canReplyToSelected,
    handledIds,
    isUnanswered,
    focusReplyRef,
    draftReply,
    sendReply,
    markHandledAndAdvance,
    unmarkHandled,
    snoozeMessage,
    pickNextAfter,
    filteredMessages,
    selectMessage,
    advanceToNextMessage,
    mailFolders,
    moveMessageToMailFolder,
    moveBusy,
    performSelectedMailAction,
    mailActionBusy,
    selectedIndex,
    navigateRelative,
  });

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
      <MessagePageChrome
        focusedReading={focusedReading}
        isMobile={isMobile}
        triageCounts={triageCounts}
        inboxLiveHint={inboxLiveHint}
        openCount={inboxStats.openCount}
        hasAnyMailConnected={hasAnyMailConnected}
        demoInboxActive={demoEnabled && inboxMessages.some((m) => m.kind === "email")}
        activeTabIsMail={activeTab === "mail"}
        businessProfileId={businessProfileId}
        onShowToday={() => setTriageBucket("today")}
        onUseMailDraft={(draft) => {
          setReplyDraft(draft);
          sonnerToast.success("Utkast infogat i svarsfältet — öppna mailet och skicka när du är nöjd.");
        }}
      />

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
