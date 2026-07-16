import { useMemo, type MutableRefObject } from "react";
import { channelBadge } from "./messagesUi";
import type { MessageDetailPanelProps } from "./MessageDetailPanel";
import type { MailFolder, ThreadMessage, UnifiedMessage } from "./types";
import type { MailMessageAction } from "./mailActionsClient";

type Args = {
  selectedMessage: UnifiedMessage | null;
  aiSummaries: Record<string, string>;
  threadMessages: ThreadMessage[];
  threadLoading: boolean;
  replyDraft: string;
  setReplyDraft: (value: string) => void;
  draftBusy: boolean;
  sendBusy: boolean;
  replySent: boolean;
  canReplyToSelected: boolean;
  handledIds: Set<string>;
  isUnanswered: (msg: UnifiedMessage) => boolean;
  focusReplyRef: MutableRefObject<(() => void) | null>;
  draftReply: () => void | Promise<void>;
  sendReply: () => void | Promise<void>;
  markHandledAndAdvance: (id: string) => void;
  unmarkHandled: (ids: string[]) => void;
  snoozeMessage: (id: string, until: "tomorrow" | "week") => void;
  pickNextAfter: (fromId: string, list: UnifiedMessage[]) => UnifiedMessage | null;
  filteredMessages: UnifiedMessage[];
  selectMessage: (msg: UnifiedMessage | null, opts?: { fromUser?: boolean }) => void;
  advanceToNextMessage: (fromId: string) => void;
  mailFolders: MailFolder[];
  moveMessageToMailFolder: (folderId: string) => void;
  moveBusy: boolean;
  performSelectedMailAction: (action: MailMessageAction) => void;
  mailActionBusy: boolean;
  selectedIndex: number;
  navigateRelative: (delta: number) => void;
};

/**
 * Builds MessageWorkspace detailProps for the selected inbox row.
 */
export function useMessageDetailProps({
  selectedMessage,
  aiSummaries,
  threadMessages,
  threadLoading,
  replyDraft,
  setReplyDraft,
  draftBusy,
  sendBusy,
  replySent,
  canReplyToSelected,
  handledIds,
  isUnanswered,
  focusReplyRef,
  draftReply,
  sendReply,
  markHandledAndAdvance,
  unmarkHandled,
  snoozeMessage,
  pickNextAfter,
  filteredMessages,
  selectMessage,
  advanceToNextMessage,
  mailFolders,
  moveMessageToMailFolder,
  moveBusy,
  performSelectedMailAction,
  mailActionBusy,
  selectedIndex,
  navigateRelative,
}: Args): Omit<MessageDetailPanelProps, "message"> | null {
  return useMemo(() => {
    if (!selectedMessage) return null;
    return {
      channelLabel: channelBadge(selectedMessage),
      aiSummary: aiSummaries[selectedMessage.id],
      threadMessages,
      threadLoading,
      replyDraft,
      onReplyDraftChange: setReplyDraft,
      draftBusy,
      sendBusy,
      replySent,
      canReply: Boolean(canReplyToSelected),
      isHandled: handledIds.has(selectedMessage.id),
      needsAttention: isUnanswered(selectedMessage),
      focusReplyRef,
      onDraftReply: () => void draftReply(),
      onSendReply: () => void sendReply(),
      onMarkHandled: () => markHandledAndAdvance(selectedMessage.id),
      onUnmarkHandled: handledIds.has(selectedMessage.id)
        ? () => unmarkHandled([selectedMessage.id])
        : undefined,
      onSnooze: !handledIds.has(selectedMessage.id)
        ? (until) => {
            snoozeMessage(selectedMessage.id, until);
            const next = pickNextAfter(selectedMessage.id, filteredMessages);
            selectMessage(next, { fromUser: true });
          }
        : undefined,
      onNextAfterSend: () => advanceToNextMessage(selectedMessage.id),
      onBack: () => selectMessage(null, { fromUser: true }),
      mailFolders: selectedMessage.kind === "email" ? mailFolders : undefined,
      onMoveToFolder: selectedMessage.kind === "email" ? moveMessageToMailFolder : undefined,
      moveBusy,
      onMailAction: selectedMessage.kind === "email" ? performSelectedMailAction : undefined,
      mailActionBusy,
      navigation:
        filteredMessages.length > 1 && selectedIndex >= 0
          ? {
              index: selectedIndex,
              total: filteredMessages.length,
              hasPrev: selectedIndex > 0,
              hasNext: selectedIndex < filteredMessages.length - 1,
              onPrev: () => navigateRelative(-1),
              onNext: () => navigateRelative(1),
            }
          : undefined,
    };
  }, [
    advanceToNextMessage,
    aiSummaries,
    canReplyToSelected,
    draftBusy,
    draftReply,
    filteredMessages,
    focusReplyRef,
    handledIds,
    isUnanswered,
    markHandledAndAdvance,
    mailFolders,
    mailActionBusy,
    moveBusy,
    moveMessageToMailFolder,
    navigateRelative,
    performSelectedMailAction,
    pickNextAfter,
    replyDraft,
    replySent,
    selectMessage,
    selectedIndex,
    selectedMessage,
    sendBusy,
    sendReply,
    setReplyDraft,
    snoozeMessage,
    threadLoading,
    threadMessages,
    unmarkHandled,
  ]);
}
