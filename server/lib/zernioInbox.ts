/**
 * Zernio inbox payload parsing.
 *
 * Zernio's inbox endpoints are loosely shaped (field names vary by platform
 * and API version), so every consumer needs the same defensive extraction
 * logic. Shared by `routes/messagesRoutes.ts` (unified inbox UI) and
 * `automation/autoReply.ts` (auto-reply cron) so the field-name knowledge
 * lives in exactly one file.
 */

export function parseZernioConversationList(body: Record<string, unknown>): unknown[] {
  const data = body.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { conversations?: unknown[] }).conversations)) {
    return (data as { conversations: unknown[] }).conversations;
  }
  if (Array.isArray(body.conversations)) return body.conversations as unknown[];
  if (Array.isArray((body as { items?: unknown[] }).items)) return (body as { items: unknown[] }).items;
  return [];
}

export function parseZernioConversationMessages(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = body.data;
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object" && Array.isArray((data as { messages?: unknown[] }).messages)) {
    return (data as { messages: Array<Record<string, unknown>> }).messages;
  }
  if (Array.isArray(body.messages)) return body.messages as Array<Record<string, unknown>>;
  if (Array.isArray((body as { items?: unknown[] }).items)) return (body as { items: Array<Record<string, unknown>> }).items;
  return [];
}

export function firstString(row: Record<string, unknown>, keys: string[]): string {
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

export function zernioConversationAccountIds(row: Record<string, unknown>): string[] {
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

export function normalizeDmPlatform(raw: unknown): string | null {
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

export function zernioConversationPlatform(row: Record<string, unknown>): string | null {
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

export function zernioConversationId(row: Record<string, unknown>): string {
  return firstString(row, ["id", "_id", "conversationId", "conversation_id", "threadId"]);
}

export function zernioConversationKey(row: Record<string, unknown>, index: number): string {
  const id = zernioConversationId(row);
  if (id) return id;
  const accountIds = zernioConversationAccountIds(row).join("|");
  const participant = firstString(row, ["participantId", "participantUsername", "participantName"]);
  const updated = firstString(row, ["updatedTime", "updatedAt", "lastMessageAt", "timestamp"]);
  return `${accountIds}:${participant}:${updated}:${index}`;
}

export function textFromZernioMessage(row: Record<string, unknown>): string {
  const nested =
    row.latestMessage && typeof row.latestMessage === "object"
      ? textFromZernioMessage(row.latestMessage as Record<string, unknown>)
      : "";
  return String(row.message || row.text || row.body || row.content || row.preview || nested || "").trim();
}

export function dateFromZernioMessage(row: Record<string, unknown>): string {
  return String(row.createdTime || row.createdAt || row.timestamp || row.sentAt || row.date || "").trim();
}

export function zernioMessageId(row: Record<string, unknown>): string {
  return firstString(row, ["id", "_id", "messageId", "message_id"]);
}

/**
 * True when a message row was written by the customer (inbound), false when
 * it was sent by the connected business account (outbound). Returns null when
 * the row carries no recognizable direction signal — callers decide how to
 * treat the unknown case (the auto-reply engine skips, to be safe).
 */
export function isInboundZernioMessage(row: Record<string, unknown>): boolean | null {
  for (const key of ["isFromMe", "fromMe", "isSelf", "isOwn", "sentByMe", "isOutgoing", "outgoing"]) {
    const value = row[key];
    if (typeof value === "boolean") return !value;
  }
  for (const key of ["isIncoming", "incoming", "isFromCustomer", "fromCustomer"]) {
    const value = row[key];
    if (typeof value === "boolean") return value;
  }
  const direction = firstString(row, ["direction", "messageDirection"]).toLowerCase();
  if (direction === "inbound" || direction === "incoming" || direction === "received") return true;
  if (direction === "outbound" || direction === "outgoing" || direction === "sent") return false;
  const senderType = firstString(row, ["senderType", "sender_type", "from_type", "authorType"]).toLowerCase();
  if (senderType === "customer" || senderType === "contact" || senderType === "user" || senderType === "participant") {
    return true;
  }
  if (senderType === "business" || senderType === "account" || senderType === "page" || senderType === "agent") {
    return false;
  }
  return null;
}
