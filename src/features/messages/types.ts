export type MailFolder = {
  id: string;
  name: string;
  accountId: string;
  provider: "gmail" | "outlook";
  messageCount?: number;
  unreadCount?: number;
};

export type MailFolderSelection = {
  accountId: string;
  folderId: string;
  folderName: string;
};

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
  isStarred?: boolean;
  externalUrl?: string;
  conversationId?: string;
  providerMessageId?: string;
  threadId?: string;
  profileId?: string | null;
}

export type MessageChannelTab = "mail" | "instagram" | "messenger" | "whatsapp";

/** Inbox list filter — queue = sectioned work queue, open = unanswered only. */
export type InboxFilter = "queue" | "open" | "all" | "handled";

/** Mail-only view filter (client-side on loaded messages). */
export type MailViewFilter = "all" | "unread" | "starred";

/** Mail list sort order. */
export type MailSortOrder = "triage" | "newest" | "oldest";

export type ThreadMessage = {
  id: string;
  date: string;
  from: { name: string; email: string };
  snippet: string;
  body: string;
  subject?: string;
  isOutgoing?: boolean;
};
