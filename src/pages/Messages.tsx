import { m } from "framer-motion";
import { Inbox, RefreshCw, Loader2, MessageSquare, Circle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { getOAuthProfileId } from "@/lib/oauthProfile";
import { Badge } from "@/components/ui/badge";
import { apiUrl } from "@/lib/apiBase";

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
}

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

export default function MessagesPage() {
  const { authMode, session } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, activeProfileId, addAccountFromOAuth, setSelectedAccountId } = useAccounts();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<UnifiedMessage | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zernioNote, setZernioNote] = useState<string | null>(null);
  const [mailErrors, setMailErrors] = useState<Array<{ accountId: string; platform: string; error: string }>>([]);
  const hasLoadedForInitialMailAccounts = useRef(false);

  const mailAccounts = useMemo(
    () => accounts.filter((a) => (a.platform === "gmail" || a.platform === "outlook") && a.isOAuth),
    [accounts]
  );
  const mailAccountKey = useMemo(
    () => mailAccounts.map((a) => `${a.id}:${a.connectedAt}`).sort().join("|"),
    [mailAccounts]
  );

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

  const loadUnified = useCallback(async () => {
    setLoading(true);
    setError(null);
    setZernioNote(null);
    setMailErrors([]);
    try {
      let res = await fetch(apiUrl("/api/messages/unified"), { credentials: "include" });
      if (res.status === 401) {
        await ensureBackendSession();
        res = await fetch(apiUrl("/api/messages/unified"), { credentials: "include" });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not load messages.");
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
  }, [ensureBackendSession]);

  useEffect(() => {
    void loadUnified();
  }, [loadUnified]);

  useEffect(() => {
    if (!hasLoadedForInitialMailAccounts.current) {
      hasLoadedForInitialMailAccounts.current = true;
      return;
    }
    void loadUnified();
  }, [mailAccountKey, loadUnified]);

  useEffect(() => {
    let ignore = false;

    async function syncMailAccountsFromBackend() {
      try {
        await ensureBackendSession();
        const platforms = ["gmail", "outlook"] as const;
        for (const platform of platforms) {
          let res = await fetch(apiUrl(`/api/accounts/connected?platform=${platform}`), { credentials: "include" });
          if (res.status === 401) {
            await ensureBackendSession();
            res = await fetch(apiUrl(`/api/accounts/connected?platform=${platform}`), { credentials: "include" });
          }
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || ignore) continue;

          const backendAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
          for (const account of backendAccounts) {
            addAccountFromOAuth(
              String(account.account_id || ""),
              platform,
              String(account.username || (platform === "gmail" ? "Gmail" : "Outlook")),
              account.profile_id ? String(account.profile_id) : undefined
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
  }, [addAccountFromOAuth, ensureBackendSession]);

  async function connectGmail() {
    await ensureBackendSession();
    const params = new URLSearchParams();
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    window.location.href = `${apiUrl("/api/auth/gmail")}?${params}`;
  }

  async function connectOutlook() {
    await ensureBackendSession();
    const params = new URLSearchParams();
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    window.location.href = `${apiUrl("/api/auth/outlook")}?${params}`;
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
      void fetch(apiUrl("/api/messages/summaries"), {
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

      {zernioNote && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/40 border-border">
            <CardContent className="py-3 text-sm text-muted-foreground">{zernioNote}</CardContent>
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
              <p className="font-medium text-sm">Connect Gmail</p>
              <Button size="sm" onClick={() => void connectGmail()} className="glow-sm">
                Connect Gmail
              </Button>
            </CardContent>
          </Card>
          <Card className="flex-1 bg-card border-border border-dashed">
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-sm">Connect Outlook</p>
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

      {!loading && messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((msg, i) => (
            <m.div key={msg.id} {...fadeUp} transition={{ duration: 0.35, delay: i * 0.02 }}>
              <Card className={`bg-card border-border hover:glow-sm transition-shadow duration-200 cursor-pointer ${msg.isUnread ? "border-l-2 border-l-primary" : ""}`}>
                <CardContent
                  className="p-4 flex items-start gap-3"
                  onClick={() => setSelectedMessage(msg)}
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
                        {msg.isUnread && <Circle className="h-2 w-2 fill-primary text-primary" />}
                        <span className="text-xs text-muted-foreground">{formatDate(msg.date)}</span>
                      </div>
                    </div>

                    <span className={`text-sm block truncate ${msg.isUnread ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                      {msg.subject}
                    </span>

                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                      {msg.kind === "email" && msg.from.name
                        ? `${msg.from.name} — ${msg.snippet}`
                        : msg.snippet}
                    </p>
                  </div>
                  <div className="hidden lg:block w-52 shrink-0 text-right">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">AI summary</p>
                    <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
                      {aiSummaries[msg.id] || "…"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          ))}
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4 }}>
          <EmptyState
            icon={Inbox}
            title="No messages yet"
            description="Connect Gmail or Outlook for email, and use Zernio with Inbox for Instagram, Facebook, X, and other DM channels."
          />
        </m.div>
      )}

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
          <div className="max-h-[60vh] overflow-auto rounded border border-border p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {selectedMessage?.body?.trim() || selectedMessage?.snippet || "(No content)"}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
