import { fetchGmailAccountData } from "../providers/gmail.ts";
import { fetchOutlookMailData } from "../providers/outlookMail.ts";
import type { ZernioModule } from "../providers/zernioModule.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  accessToken?: string;
  refreshToken?: string;
  ownerUserId?: string;
  username?: string;
  displayName?: string;
};

type TokenStore = {
  entries: () => Promise<Array<[string, StoredAccount]>>;
  set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
};

type MessagesRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  tokenStore: TokenStore;
  getStoredAccountAccess: (
    stored: StoredAccount,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
  zernio: ZernioModule;
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
    zernio,
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

    const mailEntries = await tokenStore.entries();
    for (const [accountId, rawStored] of mailEntries) {
      const stored = rawStored as StoredAccount;
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;

      const platform = String(stored.platform || "");
      if (platform !== "gmail" && platform !== "outlook") continue;

      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
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
    const zernioPromise = (async () => {
      try {
        const convResult = await zernio.listInboxConversations({
          limit: 75,
          sortOrder: "desc",
          status: "active",
          profileId: zernioProfileIdFilter || null,
        });
        if (!convResult.ok) {
          if (convResult.status === 503) {
            zernioNote =
              "ZERNIO_API_KEY is not set — social DMs from connected accounts will not appear here.";
          } else if (convResult.status === 401 || convResult.status === 403) {
            zernioNote = "Zernio inbox returned unauthorized — check API key or Inbox add-on.";
          } else if (convResult.status === 402) {
            zernioNote = "Zernio Inbox may require a plan add-on for DM access.";
          }
          return;
        }
        const body = convResult.data;
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

    // Deduplicate: one error per platform (same token error repeated across duplicate accounts)
    const seenErrors = new Set<string>();
    const dedupedErrors = mailErrors.filter((e) => {
      const key = `${e.platform}:${e.error}`;
      if (seenErrors.has(key)) return false;
      seenErrors.add(key);
      return true;
    });

    return res.json({
      messages: unified,
      ...(dedupedErrors.length ? { mailErrors: dedupedErrors } : {}),
      ...(zernioNote ? { zernioNote } : {}),
    });
  });
}
