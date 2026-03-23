import { motion } from "framer-motion";
import { Inbox, RefreshCw, Loader2, Mail, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "";

interface GmailMessage {
  id: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  snippet: string;
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
  const { oauthError, clearOauthError } = useOAuthCallback();
  const { accounts, selectedAccountId, setSelectedAccountId, activeProfileId } = useAccounts();

  const gmailAccounts = accounts.filter((a) => a.platform === "gmail" && a.isOAuth);
  const activeGmail =
    gmailAccounts.find((a) => a.id === selectedAccountId) ?? gmailAccounts[0] ?? null;

  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedFor = useRef<string | null>(null);

  const fetchMessages = useCallback(async (accountId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${accountId}/data`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not fetch emails.");
        return;
      }
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setError("Network error – make sure the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeGmail) { setMessages([]); return; }
    if (fetchedFor.current === activeGmail.id) return;
    fetchedFor.current = activeGmail.id;
    fetchMessages(activeGmail.id);
  }, [activeGmail, fetchMessages]);

  useEffect(() => {
    if (gmailAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(gmailAccounts[0].id);
    }
  }, [gmailAccounts.length]);

  function handleConnect() {
    const params = new URLSearchParams();
    if (activeProfileId) params.set("profile_id", activeProfileId);
    window.location.href = `${API_BASE}/api/auth/gmail?${params}`;
  }

  function handleRefresh() {
    if (!activeGmail) return;
    fetchedFor.current = null;
    fetchMessages(activeGmail.id);
  }

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

      {oauthError && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">
                {oauthError === "gmail_not_configured"
                  ? "Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env."
                  : `Login failed: ${oauthError.replace(/_/g, " ")}`}
              </p>
              <Button variant="ghost" size="sm" onClick={clearOauthError}>Dismiss</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {gmailAccounts.length > 1 && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
          {gmailAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => { setSelectedAccountId(acc.id); fetchedFor.current = null; }}
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
                <CardContent className="p-4 flex items-start gap-3">
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
    </div>
  );
}
