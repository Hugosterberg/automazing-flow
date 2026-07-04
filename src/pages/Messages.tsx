import { m } from "framer-motion";
import { Inbox, RefreshCw, Loader2, MessageSquare, Circle, ExternalLink, Sparkles, Send, Search, CheckCheck, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { ReplyTemplatePicker } from "@/features/reply-templates";
import { useProfileDocument } from "@/features/profile-documents";
import { UNREAD_DM_KEY } from "@/features/daily-brief/useUnreadDmCount";

interface UnifiedMessage {
  id: string;
  kind: "email" | "dm";
  channel: string;
  accountId: string;
  accountLabel: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  snippet: string;
  body: string;
  isUnread: boolean;
  externalUrl?: string;
  conversationId?: string;
  providerMessageId?: string;
  threadId?: string;
  profileId?: string | null;
}

const MESSAGE_ACCOUNT_PLATFORMS = ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as const;

type MessageChannelTab = "mail" | "instagram" | "messenger" | "whatsapp";

const MESSAGE_TABS: Array<{ value: MessageChannelTab; label: string }> = [
  { value: "mail", label: "Mail" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "whatsapp", label: "WhatsApp" },
];

function formatDate(raw: string): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function senderInitial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

/** Compact "how long has this waited" label for unanswered messages. */
function formatWaitTime(raw: string): string | null {
  if (!raw) return null;
  const ms = Date.now() - Date.parse(raw);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Cap for the persisted handled-ids list so the document stays bounded. */
const MAX_HANDLED_IDS = 500;

const COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-yellow-500",
];
function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

const DM_CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  facebook_messenger: "Messenger",
  messenger: "Messenger",
  twitter: "X",
  x: "X",
  bluesky: "Bluesky",
  reddit: "Reddit",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

function channelBadge(msg: UnifiedMessage): string {
  if (msg.kind === "email") {
    return msg.channel === "gmail" ? "Gmail" : msg.channel === "outlook" ? "Outlook" : msg.channel;
  }
  const key = msg.channel.toLowerCase();
  return DM_CHANNEL_LABELS[key] || msg.channel || "DM";
}

function providerMessageIdFor(msg: UnifiedMessage): string {
  return msg.providerMessageId || (msg.kind === "email" ? msg.id : "");
}

function messageMatchesTab(msg: UnifiedMessage, tab: MessageChannelTab): boolean {
  const channel = msg.channel.toLowerCase();
  if (tab === "mail") return msg.kind === "email";
  if (tab === "instagram") return channel === "instagram" || channel === "ig";
  if (tab === "messenger") return channel === "facebook" || channel === "messenger" || channel === "facebook_messenger";
  return channel === "whatsapp" || channel === "wa";
}

function emptyCopyForTab(tab: MessageChannelTab): { title: string; description: string } {
  if (tab === "mail") {
    return {
      title: "No mail yet",
      description: "Connect Gmail or Outlook to see email here.",
    };
  }
  if (tab === "instagram") {
    return {
      title: "No Instagram messages yet",
      description: "Instagram DMs appear here when Zernio Inbox returns conversations.",
    };
  }
  if (tab === "messenger") {
    return {
      title: "No Messenger messages yet",
      description: "Facebook Messenger conversations appear here when Zernio Inbox is available.",
    };
  }
  return {
    title: "No WhatsApp messages yet",
    description: "WhatsApp conversations appear here when Zernio Inbox is available.",
  };
}

export default function MessagesPage() {
  const { authMode, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, activeProfileId, addAccountFromOAuth, setSelectedAccountId } = useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<UnifiedMessage | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zernioNote, setZernioNote] = useState<string | null>(null);
  const [mailErrors, setMailErrors] = useState<Array<{ accountId: string; platform: string; error: string }>>([]);
  const [activeTab, setActiveTab] = useState<MessageChannelTab>("mail");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [inboxSearch, setInboxSearch] = useState("");
  const defaultedUnread = useRef(false);
  const autoDraftForId = useRef<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyDraft, setReplyDraft] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);

  // "Handled" is app-level triage (the providers don't expose mark-as-read):
  // handled ids stop counting as unanswered in this inbox. Persisted per
  // profile so the state follows the user across devices.
  const handledDoc = useProfileDocument<string[]>("messages-handled", []);
  const handledIds = useMemo(
    () => new Set(Array.isArray(handledDoc.data) ? handledDoc.data : []),
    [handledDoc.data]
  );
  const markHandled = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => !handledIds.has(id));
      if (fresh.length === 0) return;
      const next = [...(Array.isArray(handledDoc.data) ? handledDoc.data : []), ...fresh];
      handledDoc.save(next.slice(-MAX_HANDLED_IDS));
    },
    [handledDoc, handledIds]
  );
  const isUnanswered = useCallback(
    (msg: UnifiedMessage) => msg.isUnread && !handledIds.has(msg.id),
    [handledIds]
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

  const loadUnified = useCallback(async () => {
    setLoading(true);
    setError(null);
    setZernioNote(null);
    setMailErrors([]);
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
      setError(e instanceof Error ? e.message : "Request failed");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [ensureBackendSession, activeProfileId]);

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

  // Reset the reply box whenever a different message is opened.
  useEffect(() => {
    setReplyDraft("");
    setReplySent(false);
    setDraftBusy(false);
    setSendBusy(false);
  }, [selectedMessage?.id]);

  useEffect(() => {
    if (defaultedUnread.current || loading) return;
    const unread = messages.filter(isUnanswered).length;
    if (unread > 0) setUnreadOnly(true);
    defaultedUnread.current = true;
  }, [loading, messages, isUnanswered]);

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
      const res = await fetchWithTimeout(apiUrl("/api/ai/reply-draft"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: selectedMessage.kind === "email" ? "email" : "dm",
          authorName: selectedMessage.from.name || selectedMessage.subject,
          text: selectedMessage.body || selectedMessage.snippet,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(payload, "Could not draft a reply"));
      setReplyDraft(String(payload?.draft || ""));
    } catch (e) {
      toast({
        title: "AI draft failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDraftBusy(false);
    }
  }

  async function sendReply() {
    if (!selectedMessage || !replyDraft.trim()) return;
    const messageId = providerMessageIdFor(selectedMessage);
    if (selectedMessage.kind === "email" && !messageId) {
      toast({
        title: "Could not send reply",
        description: "This email is missing a provider message id. Refresh messages and try again.",
        variant: "destructive",
      });
      return;
    }
    if (selectedMessage.kind === "dm" && !selectedMessage.conversationId) return;
    setSendBusy(true);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/messages/reply"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedMessage.accountId,
          conversationId: selectedMessage.kind === "dm" ? selectedMessage.conversationId : undefined,
          messageId: selectedMessage.kind === "email" ? messageId : undefined,
          message: replyDraft.trim(),
          business_profile_id: selectedMessage.profileId || activeProfileId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(payload, "Could not send reply"));
      setReplySent(true);
      markHandled([selectedMessage.id]);
      void queryClient.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      toast({
        title: "Reply sent",
        description:
          selectedMessage.kind === "email"
            ? `Your ${selectedMessage.channel === "gmail" ? "Gmail" : "Outlook"} reply was sent.`
            : "Your message was sent via Zernio.",
      });
    } catch (e) {
      toast({
        title: "Could not send reply",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSendBusy(false);
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
    const q = inboxSearch.trim().toLowerCase();
    const rows = messages
      .filter((msg) => messageMatchesTab(msg, activeTab))
      .filter((msg) => !unreadOnly || isUnanswered(msg))
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
    // Unanswered messages first (longest wait on top), answered/read below
    // (newest first) — the inbox reads top-to-bottom as a work queue.
    return rows.sort((a, b) => {
      const aOpen = isUnanswered(a);
      const bOpen = isUnanswered(b);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const aDate = Date.parse(a.date) || 0;
      const bDate = Date.parse(b.date) || 0;
      return aOpen ? aDate - bDate : bDate - aDate;
    });
  }, [activeTab, messages, unreadOnly, inboxSearch, isUnanswered]);
  const unansweredVisible = useMemo(
    () => filteredMessages.filter(isUnanswered),
    [filteredMessages, isUnanswered]
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
  const activeEmptyCopy = emptyCopyForTab(activeTab);
  const showZernioNote = activeTab !== "mail" && Boolean(zernioNote);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={MessageSquare}
        title="Messages"
        description="Email from Gmail and Outlook, plus DMs from connected social accounts (via Zernio inbox when available)."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadUnified()}
            disabled={loading}
            className="text-muted-foreground shrink-0"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <SectionConnectionStatus area="messages" />
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.02 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.messages}
          title="Mail search"
          description="Search connected mail via Superhuman when OAuth is configured."
        />
      </m.div>

      {authMode === "local" && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Local mode is active. OAuth/connect is enabled for local testing and data stays local to your current session.
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}

      {oauthErrorDetails && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(
              oauthErrorDetails,
              {
                gmail_not_configured: "Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.",
                outlook_not_configured: "Outlook is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.local.",
              },
              "Login failed"
            )}
            onDismiss={clearOauthError}
          />
        </m.div>
      )}

      {showZernioNote && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/40 border-border">
            <CardContent className="py-3 text-sm text-muted-foreground">
              Social DM inbox unavailable: {zernioNote}
            </CardContent>
          </Card>
        </m.div>
      )}

      {mailErrors.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4">
              {mailErrors.map((me) => (
                <div key={`${me.accountId}-${me.platform}`} className="flex items-center justify-between gap-3">
                  <p className="text-sm text-destructive">
                    {me.platform === "gmail" ? "Gmail" : "Outlook"} token expired — reconnect to load messages.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => void (me.platform === "gmail" ? connectGmail() : connectOutlook())}
                  >
                    Reconnect
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </m.div>
      )}

      {!hasAnyMailConnected && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }} className="flex flex-col sm:flex-row gap-3">
          <Card className="flex-1 bg-card border-border border-dashed">
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-sm">Gmail</p>
              <Button size="sm" onClick={() => void connectGmail()} className="glow-sm">
                Connect Gmail
              </Button>
            </CardContent>
          </Card>
          <Card className="flex-1 bg-card border-border border-dashed">
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-sm">Outlook</p>
              <Button size="sm" variant="outline" onClick={() => void connectOutlook()}>
                Connect Outlook
              </Button>
            </CardContent>
          </Card>
        </m.div>
      )}

      {error && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
            </CardContent>
          </Card>
        </m.div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MessageChannelTab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto flex-1 justify-start gap-1 overflow-x-auto rounded-lg border border-border bg-card/70 p-1">
          {MESSAGE_TABS.map((tab) => {
            const counts = tabCounts[tab.value] || { total: 0, unread: 0 };
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-w-fit gap-2 rounded-md px-3 py-2 text-xs data-[state=active]:bg-accent data-[state=active]:shadow-none"
              >
                <span>{tab.label}</span>
                {counts.unread > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                    {counts.unread > 9 ? "9+" : counts.unread}
                  </span>
                ) : counts.total > 0 ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{counts.total}</span>
                ) : null}
              </TabsTrigger>
            );
          })}
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search inbox…"
                value={inboxSearch}
                onChange={(e) => setInboxSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Switch
              id="messages-unread-only"
              checked={unreadOnly}
              onCheckedChange={setUnreadOnly}
            />
            <Label htmlFor="messages-unread-only" className="text-xs text-muted-foreground cursor-pointer">
              Unread only
            </Label>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => markHandled(unansweredVisible.map((msg) => msg.id))}
              disabled={unansweredVisible.length === 0}
              title="Mark every unanswered message in this view as handled"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark handled ({unansweredVisible.length})
            </Button>
          </div>
        </div>

        {MESSAGE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <m.div
                    key={i}
                    {...fadeUp}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                  >
                    <Card className="bg-card border-border">
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-secondary animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2 py-0.5">
                          <div className="h-3.5 w-2/5 rounded bg-secondary animate-pulse" />
                          <div className="h-3 w-3/5 rounded bg-secondary animate-pulse" />
                          <div className="h-3 w-4/5 rounded bg-secondary/60 animate-pulse" />
                        </div>
                      </CardContent>
                    </Card>
                  </m.div>
                ))}
              </div>
            )}

            {!loading && filteredMessages.length > 0 && (
              <div className="space-y-2">
                {filteredMessages.map((msg, i) => {
                  const open = isUnanswered(msg);
                  const waited = open ? formatWaitTime(msg.date) : null;
                  return (
                  <m.div key={msg.id} {...fadeUp} transition={{ duration: 0.35, delay: i * 0.02 }}>
                    <Card className={`bg-card border-border hover:glow-sm transition-shadow duration-200 cursor-pointer ${open ? "border-l-2 border-l-primary" : ""}`}>
                      <CardContent
                        className="p-4 flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
                        role="button"
                        tabIndex={0}
                        aria-label={`Öppna meddelande: ${msg.subject}`}
                        onClick={() => setSelectedMessage(msg)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedMessage(msg);
                          }
                        }}
                      >
                        <div className={`h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold text-white ${avatarColor(msg.from.name || msg.from.email || msg.id)}`}>
                          {senderInitial(msg.from.name || msg.from.email)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="secondary" className="text-[11px] uppercase tracking-wide shrink-0">
                                {channelBadge(msg)}
                              </Badge>
                              {msg.accountLabel ? (
                                <span className="text-[11px] text-muted-foreground truncate">{msg.accountLabel}</span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {waited ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning tabular-nums"
                                  title="Waiting for a reply"
                                >
                                  <Clock className="h-2.5 w-2.5" aria-hidden />
                                  {waited}
                                </span>
                              ) : null}
                              {open && <Circle className="h-2 w-2 fill-primary text-primary" />}
                              <span className="text-xs text-muted-foreground">{formatDate(msg.date)}</span>
                            </div>
                          </div>

                          <span className={`text-sm block truncate ${open ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                            {msg.subject}
                          </span>

                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            {msg.kind === "email" && msg.from.name
                              ? `${msg.from.name} - ${msg.snippet}`
                              : msg.snippet}
                          </p>
                        </div>
                        <div className="hidden lg:block w-52 shrink-0 text-right">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">AI summary</p>
                          <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
                            {aiSummaries[msg.id] || "..."}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </m.div>
                  );
                })}
              </div>
            )}

            {!loading && !error && filteredMessages.length === 0 && (
              <m.div {...fadeUp} transition={{ duration: 0.4 }}>
                <EmptyState
                  icon={Inbox}
                  title={activeEmptyCopy.title}
                  description={activeEmptyCopy.description}
                />
              </m.div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={Boolean(selectedMessage)} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="break-words pr-2">{selectedMessage?.subject || "(No subject)"}</DialogTitle>
              {selectedMessage?.externalUrl ? (
                <a
                  href={selectedMessage.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Open in platform"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
            <DialogDescription className="text-xs space-y-1">
              {selectedMessage ? (
                <>
                  <span className="inline-flex items-center gap-2">
                    <Badge variant="outline">{channelBadge(selectedMessage)}</Badge>
                    {selectedMessage.accountLabel ? <span>{selectedMessage.accountLabel}</span> : null}
                  </span>
                  <span className="block">
                    {selectedMessage.from.name || selectedMessage.from.email}
                    {selectedMessage.date ? ` · ${new Date(selectedMessage.date).toLocaleString("sv-SE")}` : ""}
                  </span>
                </>
              ) : (
                ""
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded border border-border p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {selectedMessage?.body?.trim() || selectedMessage?.snippet || "(No content)"}
          </div>

          {selectedMessage &&
            ((selectedMessage.kind === "dm" && selectedMessage.conversationId) ||
              (selectedMessage.kind === "email" && providerMessageIdFor(selectedMessage))) && (
            <div className="space-y-2 pt-1">
              {replySent ? (
                <p className="text-xs text-emerald-600 inline-flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> Reply sent
                </p>
              ) : (
                <>
                  <Textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder={
                      selectedMessage.kind === "email"
                        ? "Write an email reply, or generate one with AI..."
                        : "Write a reply, or generate one with AI..."
                    }
                    className="min-h-[72px] text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void draftReply()} disabled={draftBusy}>
                      {draftBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                      AI draft
                    </Button>
                    <ReplyTemplatePicker
                      onInsert={setReplyDraft}
                      recipientName={selectedMessage.from.name}
                      disabled={sendBusy}
                    />
                    <Button size="sm" onClick={() => void sendReply()} disabled={sendBusy || !replyDraft.trim()}>
                      {sendBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Send reply
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
