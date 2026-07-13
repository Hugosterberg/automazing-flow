import { apiJson } from "@/lib/apiJson";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { ThreadMessage, UnifiedMessage } from "./types";

/** Lightweight inbox index for ⌘K — unread/open messages only. */
export async function fetchUnifiedMessagesPreview(
  businessProfileId: string | null,
  signal?: AbortSignal
): Promise<UnifiedMessage[]> {
  const params = new URLSearchParams();
  if (businessProfileId) params.set("business_profile_id", businessProfileId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetchWithTimeout(apiUrl(`/api/messages/unified${query}`), {
    credentials: "include",
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { messages?: unknown };
  const list = Array.isArray(data.messages) ? (data.messages as UnifiedMessage[]) : [];
  return list.filter((m) => m.isUnread).slice(0, 12);
}

export async function fetchMessageThread(
  message: UnifiedMessage,
  businessProfileId?: string | null,
  signal?: AbortSignal
): Promise<ThreadMessage[]> {
  const params = new URLSearchParams({ accountId: message.accountId });
  if (businessProfileId) params.set("business_profile_id", businessProfileId);

  if (message.kind === "email") {
    if (message.threadId) params.set("threadId", message.threadId);
    const providerId = message.providerMessageId;
    if (providerId) params.set("messageId", providerId);
    if (!message.threadId && !providerId) return [];
  } else if (message.conversationId) {
    params.set("conversationId", message.conversationId);
  } else {
    return [];
  }

  const payload = await apiJson<{ messages?: unknown }>(
    `/api/messages/thread?${params.toString()}`,
    "Could not load conversation thread.",
    { signal }
  );
  return Array.isArray(payload.messages) ? (payload.messages as ThreadMessage[]) : [];
}
