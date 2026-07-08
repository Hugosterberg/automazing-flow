import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import type { ThreadMessage, UnifiedMessage } from "./types";

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

  const res = await fetchWithTimeout(apiUrl(`/api/messages/thread?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Could not load conversation thread."));
  }
  return Array.isArray(payload.messages) ? payload.messages : [];
}
