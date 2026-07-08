export interface UnifiedMessage {
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
  conversationId?: string;
  providerMessageId?: string;
  threadId?: string;
  profileId?: string | null;
}

export type MessageChannelTab = "mail" | "instagram" | "messenger" | "whatsapp";

export type ThreadMessage = {
  id: string;
  date: string;
  from: { name: string; email: string };
  snippet: string;
  body: string;
  subject?: string;
  isOutgoing?: boolean;
};
