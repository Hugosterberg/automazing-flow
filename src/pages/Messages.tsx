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
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
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
import { LIVE_SYNC_MESSAGES } from "@/lib/liveSyncEvents";
import { useVisibleIntervalRefetch } from "@/hooks/useVisibleIntervalRefetch";
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
} from "@/features/messages";
import type { InboxPrefs } from "@/features/messages/inboxPrefs";

const MESSAGE_ACCOUNT_PLATFORMS = ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as const;

/** Background refresh interval while the tab is visible. */
const INBOX_REFRESH_MS = 60_000;

/** Cap for the persisted handled-ids list so the document stays bounded. */
const MAX_HANDLED_IDS = 500;

const FILTER_SHORTCUTS: Record<string, InboxFilter> = {
  "1": "queue",
  "2": "open",
  "3": "all",
  "4": "handled",
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
  const autoSelectedDesktop = useRef(false);
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

  // "Handled" is app-level triage (the providers don't expose mark-as-read):
  // handled ids stop counting as unanswered in this inbox. Persisted per
  // profile so the state follows the user across devices.
  const handledDoc = useProfileDocument<string[]>("messages-handled", []);
  const inboxPrefsDoc = useProfileDocument<InboxPrefs>("messages-inbox-prefs", {});
  const handledIds = useMemo(
    () => new Set(Array.isArray(handledDoc.data) ? handledDoc.data : []),
    [handledDoc.data]
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
  const isUnanswered = useCallback(
    (msg: UnifiedMessage) => msg.isUnread && !handledIds.has(msg.id),
    [handledIds]
  );

  const selectedId = searchParams.get("id");
  const selectedMessage = useMemo(
    () => (selectedId ? messages.find((m) => m.id === selectedId) ?? null : null),
    [messages, selectedId]
  );

  const selectMessage = useCallback(
    (msg: UnifiedMessage | null) => {
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

  const mailAccounts = useMemo(
    () => accounts.filter((a) => (a.platform === "gmail" || a.platform === "outlook") && a.isOAuth),
    [accounts]
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
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
      setZernioNote(null);
      setMailErrors([]);
    }
    try {
      // Scope the inbox to the active business profile so switching profiles
      // never shows another profile's mailboxes/DMs.
      const unifiedUrl = apiUrl(
        `/api/messages/unified${
          activeProfileId ? `?business_profile_id=${encodeURIComponent(activeProfileId)}` : ""
        }`,
      );
      let res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
      if (res.status === 401) {
        await ensureBackendSession();
        res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(d, "Could not load messages."));
      }
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (Array.isArray(data.mailErrors) && data.mailErrors.length > 0) setMailErrors(data.mailErrors);
      if (typeof data.zernioNote === "string" && data.zernioNote) setZernioNote(data.zernioNote);
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "Request failed");
        setMessages([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [ensureBackendSession, activeProfileId]);

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
    setThreadMessages([]);
    autoDraftForId.current = cached?.trim() ? selectedMessage.id : null;
  }, [selectedMessage?.id]);

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
    if (saved?.tab) setActiveTab(saved.tab);
    if (saved?.filter) {
      setInboxFilter(saved.filter);
      return;
    }
    const unread = messages.filter(isUnanswered).length;
    if (unread > 0) setInboxFilter("queue");
  }, [loading, messages, isUnanswered, inboxPrefsDoc.isLoading, inboxPrefsDoc.data]);

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
      inboxPrefsDoc.save({ ...inboxPrefsDoc.data, tab });
    },
    [inboxPrefsDoc]
  );

  useEffect(() => {
    if (!selectedMessage || draftBusy || sendBusy || replySent) return;
    if (autoDraftForId.current === selectedMessage.id) return;
    const text = (selectedMessage.body || selectedMessage.snippet || "").trim();
    if (!text) return;
    autoDraftForId.current = selectedMessage.id;
    void draftReply();
  }, [selectedMessage?.id, draftBusy, sendBusy, replySent]);

  async function draftReply() {
    if (!selectedMessage) return;
    setDraftBusy(true);
    try {
      const payload = await apiJson<{ draft?: unknown }>("/api/ai/reply-draft", "Could not draft a reply", {
        body: {
          kind: selectedMessage.kind === "email" ? "email" : "dm",
          authorName: selectedMessage.from.name || selectedMessage.subject,
          text: selectedMessage.body || selectedMessage.snippet,
        },
      });
      setReplyDraft(String(payload?.draft || ""));
    } catch (e) {
      toast({
        title: "AI-utkast misslyckades",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setDraftBusy(false);
    }
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
      const aOpen = isUnanswered(a);
      const bOpen = isUnanswered(b);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const aDate = Date.parse(a.date) || 0;
      const bDate = Date.parse(b.date) || 0;
      return aOpen ? aDate - bDate : bDate - aDate;
    });
  }, [activeTab, messages, inboxFilter, debouncedInboxSearch, isUnanswered, handledIds]);

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
      selectMessage(filteredMessages[nextIndex] ?? null);
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

  const advanceToNextMessage = useCallback(
    (fromId: string) => {
      const idx = filteredMessages.findIndex((m) => m.id === fromId);
      if (idx === -1) return;
      const next =
        filteredMessages.slice(idx + 1).find((m) => isUnanswered(m)) ??
        filteredMessages.slice(0, idx).find((m) => isUnanswered(m)) ??
        filteredMessages[idx + 1] ??
        null;
      selectMessage(next);
    },
    [filteredMessages, isUnanswered, selectMessage]
  );

  const markHandledAndAdvance = useCallback(
    (id: string) => {
      if (handledIds.has(id)) return;
      markHandled([id]);
      advanceToNextMessage(id);
    },
    [advanceToNextMessage, handledIds, markHandled]
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
    selectMessage(filteredMessages[0] ?? null);
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
    setSendBusy(true);
    try {
      await apiJson("/api/messages/reply", "Could not send reply", {
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
      markHandled([sentId], { silent: true });
      void queryClient.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      sonnerToast.success(
        selectedMessage.kind === "email"
          ? `Svar skickat via ${selectedMessage.channel === "gmail" ? "Gmail" : "Outlook"}`
          : "Svar skickat"
      );
      window.setTimeout(() => advanceToNextMessage(sentId), 500);
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
    advanceToNextMessage,
    markHandled,
    queryClient,
    replyDraft,
    selectedMessage,
    toast,
  ]);

  const getRowMeta = useCallback(
    (msg: UnifiedMessage) => ({
      open: isUnanswered(msg),
      waited: isUnanswered(msg) ? formatWaitTime(msg.date) : null,
      urgent: isUnanswered(msg) && isUrgentWait(msg.date),
      channelLabel: channelBadge(msg),
      aiSummary: aiSummaries[msg.id],
      formattedDate: formatMessageDate(msg.date),
      senderInitial: senderInitial(msg.from.name || msg.from.email),
      avatarGradient: avatarGradient(msg.from.name || msg.from.email || msg.id),
      isHandled: handledIds.has(msg.id),
    }),
    [aiSummaries, handledIds, isUnanswered]
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
  ) : inboxFilter !== "all" && hasMessagesInTab && filteredMessages.length === 0 && !debouncedInboxSearch.trim() ? (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInboxFilterPersisted("all")}>
      Visa alla meddelanden
    </Button>
  ) : undefined;

  const showZernioNote = activeTab !== "mail" && Boolean(zernioNote);

  useEffect(() => {
    if (!selectedId || loading) return;
    if (messages.some((m) => m.id === selectedId)) return;
    selectMessage(null);
  }, [loading, messages, selectedId, selectMessage]);

  useEffect(() => {
    if (!selectedMessage) return;
    if (messageMatchesTab(selectedMessage, activeTab)) return;
    selectMessage(null);
  }, [activeTab, selectedMessage, selectMessage]);

  useEffect(() => {
    autoSelectedDesktop.current = false;
  }, [activeTab, activeProfileId]);

  useEffect(() => {
    if (loading || selectedId || filteredMessages.length === 0 || autoSelectedDesktop.current) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      const first = filteredMessages.find(isUnanswered) ?? filteredMessages[0];
      if (first) selectMessage(first);
      autoSelectedDesktop.current = true;
    }
  }, [loading, selectedId, filteredMessages, isUnanswered, selectMessage]);

  const canReplyToSelected =
    selectedMessage &&
    ((selectedMessage.kind === "dm" && selectedMessage.conversationId) ||
      (selectedMessage.kind === "email" && providerMessageIdFor(selectedMessage)));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;

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
      const filterShortcut = FILTER_SHORTCUTS[e.key];
      if (filterShortcut && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
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
      if ((e.key === "r" || e.key === "R") && selectedMessage && canReplyToSelected) {
        e.preventDefault();
        focusReplyRef.current?.();
        return;
      }
      if ((e.key === "e" || e.key === "E") && selectedMessage && isUnanswered(selectedMessage)) {
        e.preventDefault();
        markHandledAndAdvance(selectedMessage.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canReplyToSelected,
    cycleTab,
    focusNextOpen,
    isUnanswered,
    markHandledAndAdvance,
    navigateOpenRelative,
    navigateRelative,
    selectMessage,
    selectedId,
    selectedMessage,
    setInboxFilterPersisted,
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
      onNextAfterSend: () => advanceToNextMessage(selectedMessage.id),
      onBack: () => selectMessage(null),
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
    filteredMessages.length,
    handledIds,
    isUnanswered,
    markHandledAndAdvance,
    navigateRelative,
    replyDraft,
    replySent,
    selectedIndex,
    selectedMessage,
    sendBusy,
    sendReply,
    threadLoading,
    threadMessages,
    unmarkHandled,
  ]);

  const openTotal = useMemo(
    () => messages.filter((msg) => messageMatchesTab(msg, activeTab) && isUnanswered(msg)).length,
    [messages, activeTab, isUnanswered]
  );

  const oauthAlertMessage = oauthErrorDetails
    ? formatOAuthErrorMessage(
        oauthErrorDetails,
        {
          gmail_not_configured:
            "Gmail är inte konfigurerat. Lägg till GOOGLE_CLIENT_ID och GOOGLE_CLIENT_SECRET i .env.local.",
          outlook_not_configured:
            "Outlook är inte konfigurerat. Lägg till MICROSOFT_CLIENT_ID och MICROSOFT_CLIENT_SECRET i .env.local.",
        },
        "Inloggning misslyckades"
      )
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4">
      <PageHeader
        icon={MessageSquare}
        title="Meddelanden"
        description="Mail, DM och WhatsApp i en inkorg — med AI-sammanfattningar och snabbsvar."
      />

      {!hasAnyMailConnected ? (
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
        transition={{ duration: 0.35, delay: 0.03 }}
        className="flex min-h-[min(78vh,880px)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/30 shadow-lg ring-1 ring-border/40"
      >
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
          onRefresh={() => void loadUnified()}
          onMarkAllHandled={() => markHandled(unansweredInTab.map((msg) => msg.id))}
          markAllDisabled={unansweredInTab.length === 0}
          onToggleAiSearch={() => setAiSearchOpen((v) => !v)}
          aiSearchOpen={aiSearchOpen}
          isSearching={Boolean(debouncedInboxSearch.trim())}
        />

        <MessageAlertsBanner
          error={error}
          onDismissError={() => setError(null)}
          mailErrors={mailErrors}
          onReconnectGmail={() => void connectGmail()}
          onReconnectOutlook={() => void connectOutlook()}
          zernioNote={zernioNote}
          showZernioNote={showZernioNote}
          oauthMessage={oauthAlertMessage || undefined}
          onDismissOAuth={oauthErrorDetails ? clearOauthError : undefined}
        />

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

        <div className="min-h-0 flex-1">
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
            onSelect={selectMessage}
            onMarkHandled={markHandledAndAdvance}
            onPrefetch={prefetchThread}
            detailProps={detailProps}
          />
        </div>

        <MessageStatusBar
          selectedLabel={
            selectedMessage
              ? selectedMessage.subject || selectedMessage.from.name || selectedMessage.from.email
              : null
          }
        />

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
