import type { UnifiedMessage } from "./types";

type InboxCacheEntry = {
  messages: UnifiedMessage[];
  savedAt: number;
};

const memory = new Map<string, InboxCacheEntry>();
const STORAGE_PREFIX = "automazing-inbox-cache:";
const MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6h

export function inboxCacheKey(args: {
  businessProfileId: string | null | undefined;
  mailAccountId?: string | null;
  mailFolderId?: string | null;
}): string {
  const bp = args.businessProfileId || "default";
  const folder =
    args.mailAccountId && args.mailFolderId
      ? `${args.mailAccountId}:${args.mailFolderId}`
      : "inbox";
  return `${bp}:${folder}`;
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

export function readInboxCache(key: string): UnifiedMessage[] | null {
  const mem = memory.get(key);
  if (mem && Date.now() - mem.savedAt < MAX_AGE_MS) return mem.messages;

  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InboxCacheEntry;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    if (Date.now() - Number(parsed.savedAt || 0) > MAX_AGE_MS) return null;
    memory.set(key, parsed);
    return parsed.messages;
  } catch {
    return null;
  }
}

export function writeInboxCache(key: string, messages: UnifiedMessage[]) {
  const entry: InboxCacheEntry = { messages, savedAt: Date.now() };
  memory.set(key, entry);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function sortUnifiedMessages(messages: UnifiedMessage[]): UnifiedMessage[] {
  return [...messages].sort((a, b) => {
    const ta = new Date(a.date || 0).getTime();
    const tb = new Date(b.date || 0).getTime();
    return tb - ta;
  });
}

/** Merge a source slice into the current list without dropping the other kind. */
export function mergeUnifiedByKind(
  current: UnifiedMessage[],
  incoming: UnifiedMessage[],
  kind: "email" | "dm"
): UnifiedMessage[] {
  const kept = current.filter((m) => m.kind !== kind);
  return sortUnifiedMessages([...kept, ...incoming]);
}
