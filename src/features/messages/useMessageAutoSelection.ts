import { useEffect, type MutableRefObject } from "react";
import { messageMatchesTab } from "./messagesUi";
import type { InboxFilter, MailFolderSelection, MailSortOrder, MailViewFilter, MessageChannelTab, UnifiedMessage } from "./types";

type Args = {
  loading: boolean;
  messages: UnifiedMessage[];
  selectedId: string | null;
  selectedMessage: UnifiedMessage | null;
  activeTab: MessageChannelTab;
  activeProfileId: string | null | undefined;
  selectedMailFolder: MailFolderSelection | null;
  inboxFilter: InboxFilter;
  mailViewFilter: MailViewFilter;
  mailSort: MailSortOrder;
  filteredMessages: UnifiedMessage[];
  selectMessage: (msg: UnifiedMessage | null, opts?: { fromUser?: boolean }) => void;
  /** Once the user picks a row, keep it until context changes or it leaves the list. */
  userPickedMessage: MutableRefObject<boolean>;
};

/**
 * URL/selection orchestration: clear stale ids, reset pick flag on context change,
 * and auto-select the top desktop list row until the user picks another.
 * Keeps selection refs on the page — this only owns the effects.
 */
export function useMessageAutoSelection({
  loading,
  messages,
  selectedId,
  selectedMessage,
  activeTab,
  activeProfileId,
  selectedMailFolder,
  inboxFilter,
  mailViewFilter,
  mailSort,
  filteredMessages,
  selectMessage,
  userPickedMessage,
}: Args) {
  useEffect(() => {
    if (!selectedId || loading) return;
    if (messages.some((m) => m.id === selectedId)) return;
    // Message was removed (archive/delete) — clear so desktop auto-picks the new top.
    userPickedMessage.current = false;
    selectMessage(null);
  }, [loading, messages, selectedId, selectMessage, userPickedMessage]);

  useEffect(() => {
    if (!selectedMessage) return;
    if (messageMatchesTab(selectedMessage, activeTab)) return;
    userPickedMessage.current = false;
    selectMessage(null);
  }, [activeTab, selectedMessage, selectMessage, userPickedMessage]);

  useEffect(() => {
    userPickedMessage.current = false;
  }, [activeTab, activeProfileId, selectedMailFolder, inboxFilter, mailViewFilter, mailSort, userPickedMessage]);

  // Desktop: always show the top list row on the right until the user picks another.
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) return;
    if (filteredMessages.length === 0) {
      if (selectedId) selectMessage(null);
      return;
    }
    const stillInList = Boolean(selectedId && filteredMessages.some((m) => m.id === selectedId));
    if (userPickedMessage.current && stillInList) return;
    const top = filteredMessages[0];
    if (top && top.id !== selectedId) selectMessage(top);
  }, [
    loading,
    filteredMessages,
    selectedId,
    selectMessage,
    activeTab,
    selectedMailFolder,
    inboxFilter,
    mailViewFilter,
    mailSort,
    userPickedMessage,
  ]);
}
