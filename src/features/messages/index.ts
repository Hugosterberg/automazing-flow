export { MessageInboxList } from "./MessageInboxList";
export { MessageInboxToolbar } from "./MessageInboxToolbar";
export { MessageAlertsBanner } from "./MessageAlertsBanner";
export { MessageInboxStats } from "./MessageInboxStats";
export { MessageStatusBar } from "./MessageStatusBar";
export { MessageWorkspace } from "./MessageWorkspace";
export { MessageThread } from "./MessageThread";
export { fetchMessageThread } from "./messagesClient";
export { MessageMailToolbar } from "./MessageMailToolbar";
export { fetchMailFolders, createMailFolder, moveMessageToFolder } from "./mailFoldersClient";
export { performMailAction, type MailMessageAction } from "./mailActionsClient";
export type { UnifiedMessage, MessageChannelTab, ThreadMessage, InboxFilter, MailFolder, MailFolderSelection, MailViewFilter, MailSortOrder } from "./types";
export type { InboxPrefs } from "./inboxPrefs";
export { MessageBody } from "./MessageBody";
export { MessageInboxRow } from "./MessageInboxRow";
export { MessageDetailPanel, MessageDetailPlaceholder } from "./MessageDetailPanel";
export type { MessageDetailPanelProps } from "./MessageDetailPanel";
export {
  splitEmailBody,
  segmentLinks,
  linkDisplayLabel,
  normalizeEmailPlainText,
  splitEmailParagraphs,
} from "./messageBodyFormat";
export {
  MESSAGE_TABS,
  avatarGradient,
  channelBadge,
  channelIconFor,
  inboxEmptyCopy,
  emptyCopyForTab,
  formatFullMessageDate,
  formatMessageDate,
  formatWaitTime,
  isUrgentWait,
  messageMatchesTab,
  providerMessageIdFor,
  senderInitial,
} from "./messagesUi";
