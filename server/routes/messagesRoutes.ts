import { fetchGmailAccountData } from "../providers/gmail.ts";
import { fetchOutlookMailData } from "../providers/outlookMail.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  accessToken?: string;
  refreshToken?: string;
  ownerUserId?: string;
  username?: string;
  displayName?: string;
};

type TokenStore = {
  entries: () => IterableIterator<[string, StoredAccount]>;
  set: (accountId: string, value: Record<string, unknown>) => unknown;
};

type MessagesRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  tokenStore: TokenStore;
  getStoredAccountAccess: (
    stored: StoredAccount,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
  ZERNIO_API_BASE: string;
  zernioAuthHeaders: () => Record<string, string> | null;
  zernioProfileIdFilter: string;
};

type UnifiedMessage = {
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
};

function parseZernioConversationList(body: Record<string, unknown>): unknown[] {
  const data = body.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { conversations?: unknown[] }).conversations)) {
    return (data as { conversations: unknown[] }).conversations;
  }
  if (Array.isArray(body.conversations)) return body.conversations as unknown[];
  if (Array.isArray((body as { items?: unknown[] }).items)) return (body as { items: unknown[] }).items;
  return [];
}

export function registerMessagesRoutes(app: import("express").Express, deps: MessagesRouteDeps) {
  const {
    getSessionUserId,
    tokenStore,
    getStoredAccountAccess,
    ZERNIO_API_BASE,
    zernioAuthHeaders,
    zernioProfileIdFilter,
  } = deps;

  app.get("/api/messages/unified", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const unified: UnifiedMessage[] = [];
    const mailErrors: Array<{ accountId: string; platform: string; error: string }> = [];
    const mailTasks: Promise<void>[] = [];

    for (const [accountId, rawStored] of tokenStore.entries()) {
      const stored = rawStored as StoredAccount;
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;

      const platform = String(stored.platform || "");
      if (platform !== "gmail" && platform !== "outlook") continue;

      if (access.migrate) {
        tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }

      mailTasks.push(
        (async () => {
          try {
            if (platform === "gmail") {
              const data = await fetchGmailAccountData({
                accessToken: String(stored.accessToken || ""),
                refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
                accountId,
                tokenStore,
                stored,
                googleClientId: process.env.GOOGLE_CLIENT_ID,
                googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
              });
              if (data && "error" in data && data.error) {
                mailErrors.push({ accountId, platform, error: String(data.error) });
                return;
              }
              const list = Array.isArray((data as { messages?: unknown[] })?.messages)
                ? (data as { messages: Array<Record<string, unknown>> }).messages
                : [];
              const label = String(stored.username || stored.displayName || "Gmail");
              for (const m of list) {
                const mid = String(m.id || "");
                const from = (m.from as { name?: string; email?: string }) || {};
                unified.push({
                  id: `email:gmail:${accountId}:${mid}`,
                  kind: "email",
                  channel: "gmail",
                  accountId,
                  accountLabel: label,
                  subject: String(m.subject || ""),
                  from: { name: String(from.name || ""), email: String(from.email || "") },
                  date: String(m.date || ""),
                  snippet: String(m.snippet || ""),
                  body: String(m.body || m.snippet || ""),
                  isUnread: Boolean(m.isUnread),
                });
              }
              return;
            }

            if (platform === "outlook") {
              const data = await fetchOutlookMailData({
                accessToken: String(stored.accessToken || ""),
                refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
                accountId,
                tokenStore,
                stored,
                microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
                microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
              });
              if (data && "error" in data && data.error) {
                mailErrors.push({ accountId, platform, error: String(data.error) });
                return;
              }
              const list = Array.isArray((data as { messages?: unknown[] })?.messages)
                ? (data as { messages: Array<Record<string, unknown>> }).messages
                : [];
              const label = String(stored.username || stored.displayName || "Outlook");
              for (const m of list) {
                const mid = String(m.id || "");
                const from = (m.from as { name?: string; email?: string }) || {};
                unified.push({
                  id: `email:outlook:${accountId}:${mid}`,
                  kind: "email",
                  channel: "outlook",
                  accountId,
                  accountLabel: label,
                  subject: String(m.subject || ""),
                  from: { name: String(from.name || ""), email: String(from.email || "") },
                  date: String(m.date || ""),
                  snippet: String(m.snippet || ""),
                  body: String(m.body || m.snippet || ""),
                  isUnread: Boolean(m.isUnread),
                });
              }
            }
          } catch (e) {
            mailErrors.push({
              accountId,
              platform,
              error: e instanceof Error ? e.message : "fetch_failed",
            });
          }
        })()
      );
    }

    let zernioNote: string | undefined;
    const zh = zernioAuthHeaders();
    const zernioPromise = (async () => {
      if (!zh) {
        zernioNote = "ZERNIO_API_KEY is not set — social DMs from connected accounts will not appear here.";
        return;
      }
      try {
        const q = new URLSearchParams();
        q.set("limit", "75");
        q.set("sortOrder", "desc");
        q.set("status", "active");
        if (zernioProfileIdFilter) q.set("profileId", zernioProfileIdFilter);

        const url = `${ZERNIO_API_BASE}/inbox/conversations?${q.toString()}`;
        const convRes = await fetch(url, { headers: zh });
        if (!convRes.ok) {
          if (convRes.status === 401 || convRes.status === 403) {
            zernioNote = "Zernio inbox returned unauthorized — check API key or Inbox add-on.";
          } else if (convRes.status === 402) {
            zernioNote = "Zernio Inbox may require a plan add-on for DM access.";
          }
          return;
        }
        const body = (await convRes.json().catch(() => ({}))) as Record<string, unknown>;
        const rows = parseZernioConversationList(body);
        for (const raw of rows) {
          const c = raw as Record<string, unknown>;
          const cid = String(c.id || c.conversationId || "").trim();
          if (!cid) continue;
          const participantName = String(c.participantName || c.participantUsername || "Direct message");
          const last = String(c.lastMessage || c.preview || "");
          const plat = String(c.platform || "social").toLowerCase();
          unified.push({
            id: `dm:zernio:${cid}`,
            kind: "dm",
            channel: plat,
            accountId: String(c.accountId || ""),
            accountLabel: String(c.accountUsername || c.accountName || ""),
            subject: participantName,
            from: { name: participantName, email: String(c.participantId || "") },
            date: String(c.updatedTime || c.updatedAt || c.lastMessageAt || ""),
            snippet: last,
            body: last,
            isUnread: Number(c.unreadCount || 0) > 0,
            externalUrl: c.url ? String(c.url) : undefined,
          });
        }
      } catch {
        zernioNote = "Could not load Zernio inbox conversations.";
      }
    })();

    await Promise.all([...mailTasks, zernioPromise]);

    unified.sort((a, b) => {
      const ta = new Date(a.date || 0).getTime();
      const tb = new Date(b.date || 0).getTime();
      return tb - ta;
    });

    return res.json({
      messages: unified,
      ...(mailErrors.length ? { mailErrors } : {}),
      ...(zernioNote ? { zernioNote } : {}),
    });
  });
}
