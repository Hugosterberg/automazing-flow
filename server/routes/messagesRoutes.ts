import { fetchGmailAccountData, fetchGmailThread, sendGmailReply, listGmailUserLabels, createGmailUserLabel, moveGmailMessageToLabel, deleteGmailMessage, archiveGmailMessage, setGmailMessageStarred } from "../providers/gmail.ts";
import { fetchOutlookMailData, fetchOutlookMailThread, sendOutlookMailReply, listOutlookUserMailFolders, createOutlookMailFolder, moveOutlookMessageToFolder, deleteOutlookMessage, archiveOutlookMessage, setOutlookMessageFlagged } from "../providers/outlookMail.ts";
import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import {
  parseZernioConversationList,
  parseZernioConversationMessages,
  firstString,
  zernioConversationAccountIds,
  normalizeDmPlatform,
  zernioConversationPlatform,
  zernioConversationKey,
  zernioConversationUnreadCount,
  textFromZernioMessage,
  dateFromZernioMessage,
  isInboundZernioMessage,
} from "../lib/zernioInbox.ts";
import {
  accountInBusinessProfile,
  readRequestBodyBusinessProfileId,
  readRequestBusinessProfileId,
} from "../lib/profileScope.ts";

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
  get: (accountId: string) => Promise<StoredAccount | null | undefined>;
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
  isStarred?: boolean;
  externalUrl?: string;
  conversationId?: string;
  providerMessageId?: string;
  threadId?: string;
  profileId?: string | null;
};

const SOCIAL_MESSAGE_PLATFORMS = ["instagram", "facebook", "whatsapp"] as const;

const ZERNIO_INBOX_PLATFORM_ALIASES: Record<string, string[]> = {
  instagram: ["instagram", "ig"],
  facebook: ["facebook", "messenger", "facebook_messenger", "facebook-messenger"],
  whatsapp: ["whatsapp", "wa"],
};

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

    // Scope every mailbox and DM account to the caller's active business
    // profile, so profiles under the same user never see each other's inbox.
    const businessProfileId = readRequestBusinessProfileId(req);
    const mailAccountId = String(req.query.mailAccountId || "").trim();
    const mailFolderId = String(req.query.mailFolderId || "").trim();
    const folderScoped = Boolean(mailAccountId && mailFolderId);
    const includeAllMailRaw = String(req.query.includeAllMail || "").trim().toLowerCase();
    const includeAllMail =
      !folderScoped && (includeAllMailRaw === "1" || includeAllMailRaw === "true");
    // Progressive loading: clients can fetch mail first, then DMs.
    const sourcesRaw = String(req.query.sources || "all").trim().toLowerCase();
    const includeMail = sourcesRaw === "all" || sourcesRaw === "mail";
    const includeDm = sourcesRaw === "all" || sourcesRaw === "dm";

    const unified: UnifiedMessage[] = [];
    const mailErrors: Array<{ accountId: string; platform: string; error: string }> = [];
    const mailTasks: Promise<void>[] = [];
    const zernioMessageAccounts: Array<{
      localAccountId: string;
      zernioAccountId: string;
      platform: string;
      label: string;
      profileId: string | null;
    }> = [];

    // Historical OAuth flows created a new token entry per reconnect, so the
    // same mailbox can exist several times. Fetch each mailbox once: keyed by
    // (platform, username), preferring entries that can refresh themselves.
    const mailCandidates = new Map<string, { accountId: string; stored: StoredAccount }>();
    function mailDedupeScore(stored: StoredAccount): number {
      return (stored.refreshToken ? 2 : 0) + (stored.username ? 1 : 0);
    }

    const mailEntries = await tokenStore.entries();
    for (const [accountId, rawStored] of mailEntries) {
      const stored = rawStored as StoredAccount;
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;

      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }
      if (!accountInBusinessProfile(stored, businessProfileId)) continue;

      const platform = String(stored.platform || "");
      const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();

      if (
        includeDm &&
        (SOCIAL_MESSAGE_PLATFORMS as readonly string[]).includes(platform) &&
        zernioAccountId
      ) {
        zernioMessageAccounts.push({
          localAccountId: accountId,
          zernioAccountId,
          platform,
          label: String(stored.username || stored.displayName || platform),
          profileId: stored.profileId ? String(stored.profileId) : null,
        });
      }

      if (!includeMail) continue;
      if (platform !== "gmail" && platform !== "outlook") continue;

      const mailboxKey = `${platform}:${String(stored.username || "").trim().toLowerCase()}`;
      const existing = mailCandidates.get(mailboxKey);
      if (!existing || mailDedupeScore(stored) > mailDedupeScore(existing.stored)) {
        mailCandidates.set(mailboxKey, { accountId, stored });
      }
    }

    for (const { accountId, stored } of mailCandidates.values()) {
      const platform = String(stored.platform || "");
      if (folderScoped && accountId !== mailAccountId) continue;
      const gmailLabelId = folderScoped && platform === "gmail" ? mailFolderId : undefined;
      const outlookFolderId = folderScoped && platform === "outlook" ? mailFolderId : undefined;
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
                labelId: gmailLabelId || "INBOX",
                includeAllMail,
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
                  isStarred: Boolean(m.isStarred),
                  providerMessageId: mid,
                  threadId: m.threadId ? String(m.threadId) : undefined,
                  profileId: stored.profileId ? String(stored.profileId) : null,
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
                folderId: outlookFolderId,
                includeAllMail,
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
                  isStarred: Boolean(m.isStarred),
                  providerMessageId: mid,
                  threadId: m.threadId ? String(m.threadId) : undefined,
                  conversationId: m.conversationId ? String(m.conversationId) : undefined,
                  profileId: stored.profileId ? String(stored.profileId) : null,
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
      if (!includeDm || zernioMessageAccounts.length === 0) return;

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
        let successfulInboxQueries = 0;

        async function addConversationRows(platform?: string, zernioAccountId?: string) {
          const convResult = await zernio.listInboxConversations({
            limit: 100,
            sortOrder: "desc",
            status: "active",
            profileId: zernioProfileIdFilter || null,
            platform,
            accountId: zernioAccountId,
          });
          if (!convResult.ok) {
            // Keep the actionable upstream reason (e.g. "Inbox add-on required")
            // instead of guessing — one note per request is enough.
            zernioNote = describeZernioFailure(convResult).message;
            return;
          }

          successfulInboxQueries += 1;
          const rows = parseZernioConversationList(convResult.data);
          rows.forEach((raw, index) => {
            if (!raw || typeof raw !== "object") return;
            const c = raw as Record<string, unknown>;
            const normalizedQueryPlatform = normalizeDmPlatform(platform);
            const row = {
              ...c,
              ...(normalizedQueryPlatform && !zernioConversationPlatform(c)
                ? { __queryPlatform: normalizedQueryPlatform }
                : {}),
              ...(zernioAccountId ? { __queryZernioAccountId: zernioAccountId } : {}),
            };
            conversationRows.set(zernioConversationKey(row, index), row);
          });
        }

        await addConversationRows();
        for (const platform of queryPlatforms) {
          await addConversationRows(platform);
        }
        for (const account of zernioMessageAccounts) {
          await addConversationRows(account.platform, account.zernioAccountId);
        }
        if (successfulInboxQueries > 0) {
          zernioNote = undefined;
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

          const participantName =
            firstString(c, [
              "participantName",
              "participant_name",
              "participantUsername",
              "participant_username",
              "contactName",
              "contact_name",
              "senderName",
              "sender_name",
            ]) || "Direct message";
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
          const fallbackText = textFromZernioMessage(c);
          const last = latestText || fallbackText;
          const plat = rowPlatform || linkedAccount.platform;
          const date = latestMessage
            ? dateFromZernioMessage(latestMessage) ||
              firstString(c, ["updatedTime", "updatedAt", "updated_at", "lastMessageAt", "last_message_at", "timestamp"])
            : firstString(c, ["updatedTime", "updatedAt", "updated_at", "lastMessageAt", "last_message_at", "timestamp"]);

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
            isUnread: zernioConversationUnreadCount(c) > 0,
            externalUrl: c.url ? String(c.url) : undefined,
            conversationId: cid || undefined,
            profileId: linkedAccount.profileId,
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

  /**
   * Lightweight unread-DM count for the home dashboard's daily brief. Unlike
   * /unified this makes a single Zernio call and never fetches per-conversation
   * messages or mail — it just sums unread inbox conversations that belong to
   * the user's connected social accounts. Failures degrade to a 0 count with a
   * note so the brief never breaks the home page.
   */
  app.get("/api/messages/unread-count", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const businessProfileId = readRequestBusinessProfileId(req);

    // The active profile's DM-capable Zernio accounts, so we never count
    // another tenant's — or another of this user's profiles' — conversations
    // that share the same Zernio workspace/profile.
    const myZernioAccountIds = new Set<string>();
    const myPlatforms = new Set<string>();
    const entries = await tokenStore.entries();
    for (const [, rawStored] of entries) {
      const stored = rawStored as StoredAccount;
      if (!getStoredAccountAccess(stored, userId).allowed) continue;
      if (!accountInBusinessProfile(stored, businessProfileId)) continue;
      const platform = String(stored.platform || "");
      if (!SOCIAL_MESSAGE_PLATFORMS.includes(platform as (typeof SOCIAL_MESSAGE_PLATFORMS)[number])) continue;
      const zid = String(stored.zernioAccountId || stored.lateAccountId || "").trim();
      if (zid) myZernioAccountIds.add(zid.toLowerCase());
      const normalized = normalizeDmPlatform(platform);
      if (normalized) myPlatforms.add(normalized);
    }
    if (myZernioAccountIds.size === 0 && myPlatforms.size === 0) {
      return res.json({ count: 0 });
    }

    const convResult = await zernio.listInboxConversations({
      limit: 100,
      sortOrder: "desc",
      status: "active",
      profileId: zernioProfileIdFilter || null,
    });
    if (!convResult.ok) {
      return res.json({ count: 0, note: describeZernioFailure(convResult).message });
    }

    let count = 0;
    for (const raw of parseZernioConversationList(convResult.data)) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as Record<string, unknown>;
      if (zernioConversationUnreadCount(c) <= 0) continue;
      const ids = zernioConversationAccountIds(c).map((id) => String(id).toLowerCase());
      const linkedById = ids.some((id) => myZernioAccountIds.has(id));
      const convPlatform = normalizeDmPlatform(zernioConversationPlatform(c));
      const linkedByPlatform = ids.length === 0 && Boolean(convPlatform) && myPlatforms.has(convPlatform);
      if (linkedById || linkedByPlatform) count += 1;
    }
    return res.json({ count });
  });

  // Reply to a social DM conversation via Zernio or to an email via Gmail/Outlook.
  app.post("/api/messages/reply", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const body = (req.body ?? {}) as {
      accountId?: string;
      conversationId?: string;
      messageId?: string;
      message?: string;
      business_profile_id?: string;
    };
    const accountId = String(body.accountId || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    const messageId = String(body.messageId || "").trim();
    const message = String(body.message || "").trim();
    const businessProfileId = readRequestBodyBusinessProfileId(req);
    if (!accountId || !message) {
      return res.status(400).json({ error: "accountId and message are required" });
    }

    const stored = await tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not connected" });
    }
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      return res.status(404).json({ error: "Account not connected" });
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }

    // Replies are tenant-scoped. The client normally sends the active
    // business_profile_id, but we also accept the stored account profile as a
    // fallback so an inbox row can still reply from its own mailbox if the UI
    // loses active-profile state during a refresh/OAuth transition.
    const effectiveBusinessProfileId =
      businessProfileId || (stored.profileId ? String(stored.profileId) : null);
    if (!effectiveBusinessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }
    if (!accountInBusinessProfile(stored, effectiveBusinessProfileId)) {
      return res.status(404).json({ error: "Account not connected for this business profile" });
    }

    const platform = String(stored.platform || "");

    if (platform === "gmail") {
      if (!messageId) return res.status(400).json({ error: "messageId is required" });
      const result = await sendGmailReply({
        accessToken: String(stored.accessToken || ""),
        refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
        accountId,
        tokenStore,
        stored,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        messageId,
        replyText: message,
      });
      if (!result.ok) {
        const reconnect =
          result.status === 401 ||
          result.status === 403 ||
          String(result.error || "").toLowerCase().includes("insufficient") ||
          String(result.error || "").toLowerCase().includes("gmail.send");
        return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
          error: reconnect ? "gmail_reconnect_required" : "gmail_reply_failed",
          message: reconnect
            ? "Reconnect Gmail to grant send permission, then try again."
            : String(result.error || "Could not send Gmail reply."),
        });
      }
      return res.json({ ok: true, data: result.data });
    }

    if (platform === "outlook") {
      if (!messageId) return res.status(400).json({ error: "messageId is required" });
      const result = await sendOutlookMailReply({
        accessToken: String(stored.accessToken || ""),
        refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
        accountId,
        tokenStore,
        stored,
        microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
        microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        messageId,
        replyText: message,
      });
      if (!result.ok) {
        const reconnect =
          result.status === 401 ||
          result.status === 403 ||
          String(result.error || "").toLowerCase().includes("privileges") ||
          String(result.error || "").toLowerCase().includes("permission") ||
          String(result.error || "").toLowerCase().includes("mail.send");
        return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
          error: reconnect ? "outlook_reconnect_required" : "outlook_reply_failed",
          message: reconnect
            ? "Reconnect Outlook to grant Mail.Send permission, then try again."
            : String(result.error || "Could not send Outlook reply."),
        });
      }
      return res.json({ ok: true, data: result.data });
    }

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();
    if (!zernioAccountId) {
      return res.status(400).json({ error: "dm_reply_requires_zernio" });
    }
    const result = await zernio.sendInboxMessage({ conversationId, accountId: zernioAccountId, message });
    if (!result.ok) {
      const failure = describeZernioFailure(result);
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: failure.code,
        message: failure.message,
      });
    }

    return res.json({ ok: true, data: result.data });
  });

  app.get("/api/messages/thread", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const accountId = String(req.query.accountId || "").trim();
    const threadId = String(req.query.threadId || "").trim();
    const messageId = String(req.query.messageId || "").trim();
    const conversationId = String(req.query.conversationId || "").trim();
    const businessProfileId = readRequestBusinessProfileId(req);

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const stored = await tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not connected" });
    }
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      return res.status(404).json({ error: "Account not connected" });
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) {
      return res.status(404).json({ error: "Account not connected for this business profile" });
    }

    const platform = String(stored.platform || "");

    if (platform === "gmail") {
      if (!threadId) {
        return res.status(400).json({ error: "threadId is required for Gmail" });
      }
      const data = await fetchGmailThread({
        accessToken: String(stored.accessToken || ""),
        refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
        accountId,
        tokenStore,
        stored,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        threadId,
      });
      if (data && "error" in data && data.error) {
        return res.status(typeof data.status === "number" ? data.status : 502).json({ error: String(data.error) });
      }
      return res.json({ messages: (data as { messages?: unknown[] }).messages || [], threadId });
    }

    if (platform === "outlook") {
      if (!threadId && !messageId && !conversationId) {
        return res.status(400).json({ error: "messageId, conversationId, or threadId is required for Outlook" });
      }
      const data = await fetchOutlookMailThread({
        accessToken: String(stored.accessToken || ""),
        refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
        accountId,
        tokenStore,
        stored,
        microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
        microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        messageId: messageId || undefined,
        conversationId: conversationId || threadId || undefined,
      });
      if (data && "error" in data && data.error) {
        return res.status(typeof data.status === "number" ? data.status : 502).json({ error: String(data.error) });
      }
      return res.json({
        messages: (data as { messages?: unknown[] }).messages || [],
        conversationId: (data as { conversationId?: string }).conversationId,
      });
    }

    if ((SOCIAL_MESSAGE_PLATFORMS as readonly string[]).includes(platform)) {
      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required for DMs" });
      }
      const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();
      if (!zernioAccountId) {
        return res.status(400).json({ error: "dm_thread_requires_zernio" });
      }
      const result = await zernio.listInboxConversationMessages(conversationId, {
        accountId: zernioAccountId,
        limit: 50,
        sortOrder: "asc",
      });
      if (!result.ok) {
        const failure = describeZernioFailure(result);
        return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
          error: failure.code,
          message: failure.message,
        });
      }
      const rows = parseZernioConversationMessages(result.data);
      const messages = rows.map((raw, index) => {
        const row = raw as Record<string, unknown>;
        const inbound = isInboundZernioMessage(row);
        const fromName =
          firstString(row, [
            "senderName",
            "sender_name",
            "fromName",
            "from_name",
            "authorName",
            "author_name",
            "participantName",
            "participant_name",
          ]) || (inbound === false ? String(stored.displayName || stored.username || "You") : "Contact");
        const text = textFromZernioMessage(row);
        return {
          id: firstString(row, ["id", "_id", "messageId", "message_id"]) || String(index),
          date: dateFromZernioMessage(row),
          from: { name: fromName, email: "" },
          snippet: text.slice(0, 160),
          body: text,
          isOutgoing: inbound === false,
        };
      });
      return res.json({ messages, conversationId });
    }

    return res.status(400).json({ error: "Unsupported account platform for thread fetch" });
  });

  async function resolveMailAccount(req: import("express").Request, res: import("express").Response, accountId: string) {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    const stored = await tokenStore.get(accountId);
    if (!stored) {
      res.status(404).json({ error: "Account not connected" });
      return null;
    }
    const access = getStoredAccountAccess(stored as StoredAccount, userId);
    if (!access.allowed) {
      res.status(404).json({ error: "Account not connected" });
      return null;
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    const businessProfileId =
      readRequestBodyBusinessProfileId(req) || readRequestBusinessProfileId(req) ||
      ((stored as StoredAccount).profileId ? String((stored as StoredAccount).profileId) : null);
    if (!businessProfileId) {
      res.status(400).json({ error: "business_profile_id is required" });
      return null;
    }
    if (!accountInBusinessProfile(stored as StoredAccount, businessProfileId)) {
      res.status(404).json({ error: "Account not connected for this business profile" });
      return null;
    }
    const platform = String((stored as StoredAccount).platform || "");
    if (platform !== "gmail" && platform !== "outlook") {
      res.status(400).json({ error: "Folders are only supported for Gmail and Outlook" });
      return null;
    }
    return { stored: stored as StoredAccount, platform, businessProfileId };
  }

  app.get("/api/messages/folders", async (req, res) => {
    const accountId = String(req.query.accountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }
    const resolved = await resolveMailAccount(req, res, accountId);
    if (!resolved) return;
    const { stored, platform } = resolved;
    const commonArgs = {
      accessToken: String(stored.accessToken || ""),
      refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
      accountId,
      tokenStore,
      stored,
    };

    if (platform === "gmail") {
      const data = await listGmailUserLabels({
        ...commonArgs,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      if ("error" in data && data.error) {
        return res.status(typeof data.status === "number" ? data.status : 502).json({ error: String(data.error) });
      }
      return res.json({
        folders: (data.folders || []).map((folder) => ({
          id: folder.id,
          name: folder.name,
          accountId,
          provider: "gmail",
          messageCount: folder.messagesTotal,
          unreadCount: folder.messagesUnread,
        })),
      });
    }

    const data = await listOutlookUserMailFolders({
      ...commonArgs,
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
      microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    });
    if ("error" in data && data.error) {
      return res.status(typeof data.status === "number" ? data.status : 502).json({ error: String(data.error) });
    }
    return res.json({
      folders: (data.folders || []).map((folder) => ({
        id: folder.id,
        name: folder.name,
        accountId,
        provider: "outlook",
        messageCount: folder.totalItemCount,
        unreadCount: folder.unreadItemCount,
      })),
    });
  });

  app.post("/api/messages/folders", async (req, res) => {
    const body = (req.body ?? {}) as { accountId?: string; name?: string; business_profile_id?: string };
    const accountId = String(body.accountId || "").trim();
    const name = String(body.name || "").trim();
    if (!accountId || !name) {
      return res.status(400).json({ error: "accountId and name are required" });
    }
    const resolved = await resolveMailAccount(req, res, accountId);
    if (!resolved) return;
    const { stored, platform } = resolved;
    const commonArgs = {
      accessToken: String(stored.accessToken || ""),
      refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
      accountId,
      tokenStore,
      stored,
      name,
    };

    if (platform === "gmail") {
      const result = await createGmailUserLabel({
        ...commonArgs,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      if (!result.ok) {
        return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: result.error });
      }
      return res.json({
        folder: {
          id: result.folder.id,
          name: result.folder.name,
          accountId,
          provider: "gmail",
        },
      });
    }

    const result = await createOutlookMailFolder({
      ...commonArgs,
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
      microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    });
    if (!result.ok) {
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: result.error });
    }
    return res.json({
      folder: {
        id: result.folder.id,
        name: result.folder.name,
        accountId,
        provider: "outlook",
      },
    });
  });

  app.post("/api/messages/move", async (req, res) => {
    const body = (req.body ?? {}) as {
      accountId?: string;
      messageId?: string;
      folderId?: string;
      business_profile_id?: string;
    };
    const accountId = String(body.accountId || "").trim();
    const messageId = String(body.messageId || "").trim();
    const folderId = String(body.folderId || "").trim();
    if (!accountId || !messageId || !folderId) {
      return res.status(400).json({ error: "accountId, messageId and folderId are required" });
    }
    const resolved = await resolveMailAccount(req, res, accountId);
    if (!resolved) return;
    const { stored, platform } = resolved;
    const commonArgs = {
      accessToken: String(stored.accessToken || ""),
      refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
      accountId,
      tokenStore,
      stored,
      messageId,
    };

    if (platform === "gmail") {
      const result = await moveGmailMessageToLabel({
        ...commonArgs,
        labelId: folderId,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      if (!result.ok) {
        const reconnect =
          result.status === 401 ||
          result.status === 403 ||
          String(result.error || "").toLowerCase().includes("insufficient");
        return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
          error: reconnect ? "gmail_reconnect_required" : "gmail_move_failed",
          message: reconnect
            ? "Koppla om Gmail och godkänn behörighet att flytta mail (gmail.modify)."
            : String(result.error || "Could not move Gmail message."),
        });
      }
      return res.json({ ok: true });
    }

    const result = await moveOutlookMessageToFolder({
      ...commonArgs,
      folderId,
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
      microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    });
    if (!result.ok) {
      const reconnect =
        result.status === 401 ||
        result.status === 403 ||
        String(result.error || "").toLowerCase().includes("permission");
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: reconnect ? "outlook_reconnect_required" : "outlook_move_failed",
        message: reconnect
          ? "Koppla om Outlook och godkänn Mail.ReadWrite för att flytta mail."
          : String(result.error || "Could not move Outlook message."),
      });
    }
    return res.json({ ok: true });
  });

  app.post("/api/messages/action", async (req, res) => {
    const body = (req.body ?? {}) as {
      accountId?: string;
      messageId?: string;
      action?: string;
      business_profile_id?: string;
    };
    const accountId = String(body.accountId || "").trim();
    const messageId = String(body.messageId || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    if (!accountId || !messageId || !action) {
      return res.status(400).json({ error: "accountId, messageId and action are required" });
    }
    if (!["delete", "archive", "flag", "unflag"].includes(action)) {
      return res.status(400).json({ error: "Unsupported action" });
    }
    const resolved = await resolveMailAccount(req, res, accountId);
    if (!resolved) return;
    const { stored, platform } = resolved;
    const commonArgs = {
      accessToken: String(stored.accessToken || ""),
      refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
      accountId,
      tokenStore,
      stored,
      messageId,
    };

    if (platform === "gmail") {
      const gmailArgs = {
        ...commonArgs,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      };
      const result =
        action === "delete"
          ? await deleteGmailMessage(gmailArgs)
          : action === "archive"
            ? await archiveGmailMessage(gmailArgs)
            : await setGmailMessageStarred({ ...gmailArgs, starred: action === "flag" });
      if (!result.ok) {
        const reconnect =
          result.status === 401 ||
          result.status === 403 ||
          String(result.error || "").toLowerCase().includes("insufficient");
        return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
          error: reconnect ? "gmail_reconnect_required" : `gmail_${action}_failed`,
          message: reconnect
            ? "Koppla om Gmail och godkänn behörighet att hantera mail (gmail.modify)."
            : String(result.error || `Could not ${action} Gmail message.`),
        });
      }
      return res.json({ ok: true, starred: action === "flag" ? true : action === "unflag" ? false : undefined });
    }

    const outlookArgs = {
      ...commonArgs,
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
      microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    };
    const result =
      action === "delete"
        ? await deleteOutlookMessage(outlookArgs)
        : action === "archive"
          ? await archiveOutlookMessage(outlookArgs)
          : await setOutlookMessageFlagged({ ...outlookArgs, flagged: action === "flag" });
    if (!result.ok) {
      const reconnect =
        result.status === 401 ||
        result.status === 403 ||
        String(result.error || "").toLowerCase().includes("permission");
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: reconnect ? "outlook_reconnect_required" : `outlook_${action}_failed`,
        message: reconnect
          ? "Koppla om Outlook och godkänn Mail.ReadWrite för att hantera mail."
          : String(result.error || `Could not ${action} Outlook message.`),
      });
    }
    return res.json({ ok: true, starred: action === "flag" ? true : action === "unflag" ? false : undefined });
  });
}
