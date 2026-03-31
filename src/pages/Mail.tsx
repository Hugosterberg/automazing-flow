import { motion } from "framer-motion";
import { Inbox, RefreshCw, Loader2, Mail, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { getOAuthProfileId } from "@/lib/oauthProfile";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "";

interface GmailMessage {
  id: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  snippet: string;
  body?: string;
  isUnread: boolean;
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

const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

export default function MailPage() {
  const { authMode, session } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, getSelectedAccountId, setSelectedAccountId, activeProfileId } = useAccounts();
  const selectedAccountId = getSelectedAccountId("mail");
  const [messagesInitial] = useState<GmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const {
    scopedAccounts: gmailAccounts,
    activeAccount: activeGmail,
    data: messages,
    loading,
    error,
    setError,
    refresh,
  } = useAccountData<GmailMessage[]>({
    accounts,
    selectedAccountId,
    setSelectedAccountId: (id) => setSelectedAccountId("mail", id),
    accountFilter: (a) => a.platform === "gmail" && Boolean(a.isOAuth),
    initialData: messagesInitial,
    fetcher: async (accountId) => {
      let res = await fetch(`${API_BASE}/api/accounts/${accountId}/data`, { credentials: "include" });
      if (res.status === 401 && authMode === "cloud" && session?.access_token) {
        await fetch(`${API_BASE}/api/auth/session`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          credentials: "include",
        }).catch(() => {});
        res = await fetch(`${API_BASE}/api/accounts/${accountId}/data`, { credentials: "include" });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not fetch emails.");
      }
      const data = await res.json();
      return Array.isArray(data.messages) ? data.messages : [];
    },
  });

  function handleConnect() {
    const params = new URLSearchParams();
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    window.location.href = `${API_BASE}/api/auth/gmail?${params}`;
  }

  function handleRefresh() {
    void refresh();
  }

  const summaryPayload = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        subject: m.subject,
        snippet: m.snippet,
        from: m.from,
      })),
    [messages]
  );

  useEffect(() => {
    if (!activeGmail || summaryPayload.length === 0) {
      setAiSummaries({});
      return;
    }
    const ac = new AbortController();
    void fetch(`${API_BASE}/api/mail/summaries`, {
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
      .catch(() => {
        // Keep UI functional even if summarization fails.
      });
    return () => ac.abort();
  }, [activeGmail, summaryPayload]);

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mail</h1>
            <p className="text-muted-foreground mt-1">Latest emails from your inbox</p>
          </div>
          {activeGmail && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="text-muted-foreground"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          )}
        </div>
      </motion.div>

      {authMode === "local" && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Local mode is active. OAuth/connect is enabled for local testing and data stays local to your current session.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {oauthErrorDetails && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(
              oauthErrorDetails,
              {
                gmail_not_configured: "Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
              },
              "Login failed"
            )}
            onDismiss={clearOauthError}
          />
        </motion.div>
      )}

      {gmailAccounts.length > 1 && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
          {gmailAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId("mail", acc.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeGmail?.id === acc.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {acc.username}
            </button>
          ))}
        </motion.div>
      )}

      {gmailAccounts.length === 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-14 flex flex-col items-center gap-5 text-center">
              <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
                <Mail className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Connect your Gmail account</p>
                <p className="text-sm text-muted-foreground">
                  View your 10 most recent emails directly in the app.
                </p>
              </div>
              <Button onClick={handleConnect} className="glow-sm">
                Connect Gmail
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {error && activeGmail && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
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
            </motion.div>
          ))}
        </div>
      )}

      {!loading && messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((msg, i) => (
            <motion.div key={msg.id} {...fadeUp} transition={{ duration: 0.35, delay: i * 0.04 }}>
              <Card className={`bg-card border-border hover:glow-sm transition-shadow duration-200 cursor-pointer ${msg.isUnread ? "border-l-2 border-l-primary" : ""}`}>
                <CardContent
                  className="p-4 flex items-start gap-3"
                  onClick={() => setSelectedMessage(msg)}
                >
                  <div className={`h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold text-white ${avatarColor(msg.from.name || msg.from.email)}`}>
                    {senderInitial(msg.from.name || msg.from.email)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${msg.isUnread ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                        {msg.from.name || msg.from.email}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {msg.isUnread && <Circle className="h-2 w-2 fill-primary text-primary" />}
                        <span className="text-xs text-muted-foreground">{formatDate(msg.date)}</span>
                      </div>
                    </div>

                    <p className={`text-sm truncate ${msg.isUnread ? "font-medium" : "text-muted-foreground"}`}>
                      {msg.subject}
                    </p>

                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                      {msg.snippet}
                    </p>
                  </div>
                  <div className="hidden md:block w-52 shrink-0 text-right">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">AI summary</p>
                    <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
                      {aiSummaries[msg.id] || "Analyserar innehall..."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && !error && activeGmail && messages.length === 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Inbox is empty.</p>
            </CardContent>
          </Card>
        </motion.div>
      )}
      <Dialog open={Boolean(selectedMessage)} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words">{selectedMessage?.subject || "(No subject)"}</DialogTitle>
            <DialogDescription className="text-xs">
              {selectedMessage
                ? `${selectedMessage.from.name || selectedMessage.from.email} · ${selectedMessage.date ? new Date(selectedMessage.date).toLocaleString("sv-SE") : ""}`
                : ""}
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
