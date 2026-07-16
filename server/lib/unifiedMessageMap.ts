/**
 * Map provider mail rows into the unified inbox shape used by /api/messages/unified.
 * Kept out of the route file so mapping stays testable and provider-agnostic.
 */

export type UnifiedEmailMessage = {
  id: string;
  kind: "email";
  channel: "gmail" | "outlook";
  accountId: string;
  accountLabel: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  snippet: string;
  body: string;
  isUnread: boolean;
  isStarred: boolean;
  providerMessageId: string;
  threadId?: string;
  conversationId?: string;
  profileId: string | null;
};

export function mapGmailMessageToUnified(args: {
  accountId: string;
  accountLabel: string;
  profileId: string | null;
  message: Record<string, unknown>;
}): UnifiedEmailMessage | null {
  const mid = String(args.message.id || "").trim();
  if (!mid) return null;
  const from = (args.message.from as { name?: string; email?: string }) || {};
  return {
    id: `email:gmail:${args.accountId}:${mid}`,
    kind: "email",
    channel: "gmail",
    accountId: args.accountId,
    accountLabel: args.accountLabel,
    subject: String(args.message.subject || ""),
    from: { name: String(from.name || ""), email: String(from.email || "") },
    date: String(args.message.date || ""),
    snippet: String(args.message.snippet || ""),
    body: String(args.message.body || args.message.snippet || ""),
    isUnread: Boolean(args.message.isUnread),
    isStarred: Boolean(args.message.isStarred),
    providerMessageId: mid,
    threadId: args.message.threadId ? String(args.message.threadId) : undefined,
    profileId: args.profileId,
  };
}

export function mapOutlookMessageToUnified(args: {
  accountId: string;
  accountLabel: string;
  profileId: string | null;
  message: Record<string, unknown>;
}): UnifiedEmailMessage | null {
  const mid = String(args.message.id || "").trim();
  if (!mid) return null;
  const from = (args.message.from as { name?: string; email?: string }) || {};
  return {
    id: `email:outlook:${args.accountId}:${mid}`,
    kind: "email",
    channel: "outlook",
    accountId: args.accountId,
    accountLabel: args.accountLabel,
    subject: String(args.message.subject || ""),
    from: { name: String(from.name || ""), email: String(from.email || "") },
    date: String(args.message.date || ""),
    snippet: String(args.message.snippet || ""),
    body: String(args.message.body || args.message.snippet || ""),
    isUnread: Boolean(args.message.isUnread),
    isStarred: Boolean(args.message.isStarred),
    providerMessageId: mid,
    threadId: args.message.threadId ? String(args.message.threadId) : undefined,
    conversationId: args.message.conversationId ? String(args.message.conversationId) : undefined,
    profileId: args.profileId,
  };
}

/** Parse unified inbox query flags used by GET /api/messages/unified. */
export function parseUnifiedMessagesQuery(query: Record<string, unknown> | undefined): {
  mailAccountId: string;
  mailFolderId: string;
  folderScoped: boolean;
  includeAllMail: boolean;
  includeMail: boolean;
  includeDm: boolean;
} {
  const mailAccountId = String(query?.mailAccountId || "").trim();
  const mailFolderId = String(query?.mailFolderId || "").trim();
  const folderScoped = Boolean(mailAccountId && mailFolderId);
  const includeAllMailRaw = String(query?.includeAllMail || "").trim().toLowerCase();
  const includeAllMail =
    !folderScoped && (includeAllMailRaw === "1" || includeAllMailRaw === "true");
  const sourcesRaw = String(query?.sources || "all").trim().toLowerCase();
  return {
    mailAccountId,
    mailFolderId,
    folderScoped,
    includeAllMail,
    includeMail: sourcesRaw === "all" || sourcesRaw === "mail",
    includeDm: sourcesRaw === "all" || sourcesRaw === "dm",
  };
}
