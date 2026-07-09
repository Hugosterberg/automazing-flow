import { apiJson } from "@/lib/apiJson";
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

  const payload = await apiJson<{ messages?: unknown }>(
    `/api/messages/thread?${params.toString()}`,
    "Could not load conversation thread.",
    { signal }
  );
  return Array.isArray(payload.messages) ? (payload.messages as ThreadMessage[]) : [];
}
