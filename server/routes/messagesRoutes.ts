import { fetchGmailAccountData } from "../providers/gmail.ts";
import { fetchOutlookMailData } from "../providers/outlookMail.ts";
import type { ZernioModule } from "../providers/zernioModule.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  accessToken?: string;
  refreshToken?: string;
  ownerUserId?: string;
  profileId?: string | null;
  username?: string;
  displayName?: string;
  zernioAccountId?: string;
  lateAccountId?: string;
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

const SOCIAL_MESSAGE_PLATFORMS = ["instagram", "facebook", "whatsapp"] as const;

const ZERNIO_INBOX_PLATFORM_ALIASES: Record<string, string[]> = {
  instagram: ["instagram", "ig"],
  facebook: ["facebook", "messenger", "facebook_messenger", "facebook-messenger"],
  whatsapp: ["whatsapp", "wa"],
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

function parseZernioConversationMessages(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = body.data;
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object" && Array.isArray((data as { messages?: unknown[] }).messages)) {
    return (data as { messages: Array<Record<string, unknown>> }).messages;
  }
  if (Array.isArray(body.messages)) return body.messages as Array<Record<string, unknown>>;
  if (Array.isArray((body as { items?: unknown[] }).items)) return (body as { items: Array<Record<string, unknown>> }).items;
  return [];
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function collectObjectIds(value: unknown, out: Set<string>) {
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  for (const key of [
    "id",
    "_id",
    "accountId",
    "account_id",
    "socialAccountId",
    "social_account_id",
    "externalId",
  ]) {
    const id = row[key];
    if (typeof id === "string" && id.trim()) out.add(id.trim());
    if (typeof id === "number") out.add(String(id));
  }
}

function zernioConversationAccountIds(row: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const direct = firstString(row, [
    "accountId",
    "account_id",
    "socialAccountId",
    "social_account_id",
    "connectedAccountId",
    "channelAccountId",
    "providerAccountId",
    "pageId",
    "page_id",
  ]);
  if (direct) out.add(direct);
  for (const key of ["account", "socialAccount", "channelAccount", "providerAccount", "page"]) {
    collectObjectIds(row[key], out);
  }
  return [...out];
}

function normalizeDmPlatform(raw: unknown): string | null {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!s) return null;
  if (s === "ig" || s.includes("instagram")) return "instagram";
  if (s === "wa" || s.includes("whatsapp")) return "whatsapp";
  if (s.includes("messenger") || s.includes("facebook") || s === "fb") return "facebook";
  return null;
}

function zernioConversationPlatform(row: Record<string, unknown>): string | null {
  const direct = firstString(row, ["platform", "channel", "provider", "type", "source", "__queryPlatform"]);
  const normalizedDirect = normalizeDmPlatform(direct);
  if (normalizedDirect) return normalizedDirect;
  for (const key of ["account", "socialAccount", "channelAccount", "providerAccount", "page"]) {
    const value = row[key];
    if (!value || typeof value !== "object") continue;
    const nested = firstString(value as Record<string, unknown>, ["platform", "channel", "provider", "type"]);
    const normalizedNested = normalizeDmPlatform(nested);
    if (normalizedNested) return normalizedNested;
  }
  return null;
}

function zernioConversationKey(row: Record<string, unknown>, index: number): string {
  const id = firstString(row, ["id", "_id", "conversationId", "conversation_id", "threadId"]);
  if (id) return id;
  const accountIds = zernioConversationAccountIds(row).join("|");
  const participant = firstString(row, ["participantId", "participantUsername", "participantName"]);
  const updated = firstString(row, ["updatedTime", "updatedAt", "lastMessageAt", "timestamp"]);
  return `${accountIds}:${participant}:${updated}:${index}`;
}

function textFromZernioMessage(row: Record<string, unknown>): string {
  const nested =
    row.latestMessage && typeof row.latestMessage === "object"
      ? textFromZernioMessage(row.latestMessage as Record<string, unknown>)
      : "";
  return String(row.message || row.text || row.body || row.content || row.preview || nested || "").trim();
}

function dateFromZernioMessage(row: Record<string, unknown>): string {
  return String(row.createdTime || row.createdAt || row.timestamp || row.sentAt || row.date || "").trim();
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
    const zernioMessageAccounts: Array<{
      localAccountId: string;
      zernioAccountId: string;
      platform: string;
      label: string;
    }> = [];

    const mailEntries = await tokenStore.entries();
    for (const [accountId, rawStored] of mailEntries) {
      const stored = rawStored as StoredAccount;
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;

      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }

      const platform = String(stored.platform || "");
      const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();

      if ((SOCIAL_MESSAGE_PLATFORMS as readonly string[]).includes(platform) && zernioAccountId) {
        zernioMessageAccounts.push({
          localAccountId: accountId,
          zernioAccountId,
          platform,
          label: String(stored.username || stored.displayName || platform),
        });
      }

      if (platform !== "gmail" && platform !== "outlook") continue;

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
      if (zernioMessageAccounts.length === 0) return;

      try {
        const accountsByPlatform = new Map<string, typeof zernioMessageAccounts>();
        const accountByZernioId = new Map<string, (typeof zernioMessageAccounts)[number]>();
        for (const account of zernioMessageAccounts) {
          accountsByPlatform.set(account.platform, [
            ...(accountsByPlatform.get(account.platform) || []),
            account,
          ]);
          accountByZernioId.set(account.zernioAccountId, account);
          accountByZernioId.set(account.zernioAccountId.toLowerCase(), account);
        }

        const queryPlatforms = new Set<string>();
        for (const platform of accountsByPlatform.keys()) {
          for (const alias of ZERNIO_INBOX_PLATFORM_ALIASES[platform] || [platform]) {
            queryPlatforms.add(alias);
          }
        }
        const conversationRows = new Map<string, Record<string, unknown>>();

        async function addConversationRows(platform?: string) {
          const convResult = await zernio.listInboxConversations({
            limit: 100,
            sortOrder: "desc",
            status: "active",
            profileId: zernioProfileIdFilter || null,
            platform,
          });
          if (!convResult.ok) {
            if (convResult.status === 503) {
              zernioNote =
                "ZERNIO_API_KEY is not set - social DMs from connected accounts will not appear here.";
            } else if (convResult.status === 401 || convResult.status === 403) {
              zernioNote = "Zernio inbox returned unauthorized - check API key or reconnect with inbox permissions.";
            } else if (convResult.status === 402) {
              zernioNote = "Zernio Inbox may require inbox access for DM conversations.";
            }
            return;
          }

          const rows = parseZernioConversationList(convResult.data);
          rows.forEach((raw, index) => {
            if (!raw || typeof raw !== "object") return;
            const c = raw as Record<string, unknown>;
            const normalizedQueryPlatform = normalizeDmPlatform(platform);
            const row =
              normalizedQueryPlatform && !zernioConversationPlatform(c)
                ? { ...c, __queryPlatform: normalizedQueryPlatform }
                : c;
            conversationRows.set(zernioConversationKey(row, index), row);
          });
        }

        await addConversationRows();
        for (const platform of queryPlatforms) {
          await addConversationRows(platform);
        }

        let rowIndex = 0;
        for (const c of conversationRows.values()) {
          const cid = firstString(c, ["id", "_id", "conversationId", "conversation_id", "threadId"]);

          const rowAccountIds = zernioConversationAccountIds(c);
          const rowPlatform = zernioConversationPlatform(c);
          let linkedAccount = rowAccountIds
            .map((id) => accountByZernioId.get(id) ?? accountByZernioId.get(id.toLowerCase()))
            .find((account): account is (typeof zernioMessageAccounts)[number] => Boolean(account));
          if (!linkedAccount && rowPlatform) {
            const samePlatformAccounts = accountsByPlatform.get(rowPlatform) || [];
            if (samePlatformAccounts.length === 1) {
              linkedAccount = samePlatformAccounts[0];
            }
          }
          if (!linkedAccount) continue;

          const participantName = String(c.participantName || c.participantUsername || "Direct message");
          const messageResult = cid
            ? await zernio.listInboxConversationMessages(cid, {
                accountId: linkedAccount.zernioAccountId,
                limit: 1,
                sortOrder: "desc",
              })
            : null;
          const latestMessage =
            messageResult?.ok
              ? parseZernioConversationMessages(messageResult.data)[0]
              : undefined;
          const latestText = latestMessage ? textFromZernioMessage(latestMessage) : "";
          const fallbackText = String(c.lastMessage || c.preview || "").trim();
          const last = latestText || fallbackText;
          const plat = rowPlatform || linkedAccount.platform;
          const date = latestMessage
            ? dateFromZernioMessage(latestMessage) || String(c.updatedTime || c.updatedAt || c.lastMessageAt || "")
            : String(c.updatedTime || c.updatedAt || c.lastMessageAt || "");

          unified.push({
            id: `dm:zernio:${linkedAccount.localAccountId}:${cid || zernioConversationKey(c, rowIndex++)}`,
            kind: "dm",
            channel: plat,
            accountId: linkedAccount.localAccountId,
            accountLabel: String(c.accountUsername || c.accountName || linkedAccount.label),
            subject: participantName,
            from: { name: participantName, email: String(c.participantId || "") },
            date,
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
