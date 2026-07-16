import { useCallback, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { moveMessageToFolder } from "./mailFoldersClient";
import { performMailAction, type MailMessageAction } from "./mailActionsClient";
import { inboxCacheKey, writeInboxCache } from "./inboxCache";
import { buildInboxLoadScope } from "./inboxLoadParams";
import { providerMessageIdFor } from "./messagesUi";
import type {
  MailFolder,
  MailFolderSelection,
  MessageChannelTab,
  UnifiedMessage,
} from "./types";

type Args = {
  activeTab: MessageChannelTab;
  selectedMailFolder: MailFolderSelection | null;
  includeAllMail: boolean;
  activeProfileId: string | null | undefined;
  businessProfileId: string | null;
  selectedMessage: UnifiedMessage | null;
  filteredMessages: UnifiedMessage[];
  pickNextAfter: (fromId: string, list: UnifiedMessage[]) => UnifiedMessage | null;
  selectMessage: (msg: UnifiedMessage | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
};

/**
 * Mail folder list + move/archive/delete/flag actions for the selected email.
 * Owns mailFolders / busy flags and advances selection after dismissals.
 */
export function useMailInboxActions({
  activeTab,
  selectedMailFolder,
  includeAllMail,
  activeProfileId,
  businessProfileId,
  selectedMessage,
  filteredMessages,
  pickNextAfter,
  selectMessage,
  setMessages,
}: Args) {
  const [mailFolders, setMailFolders] = useState<MailFolder[]>([]);
  const [moveBusy, setMoveBusy] = useState(false);
  const [mailActionBusy, setMailActionBusy] = useState(false);

  const removeMessageFromInbox = useCallback(
    (messageId: string) => {
      setMessages((prev) => {
        const next = prev.filter((msg) => msg.id !== messageId);
        const scope = buildInboxLoadScope({ activeTab, selectedMailFolder, includeAllMail });
        const cacheKey = inboxCacheKey({
          businessProfileId: activeProfileId,
          mailAccountId: scope.mailAccountId,
          mailFolderId: scope.mailFolderId,
          includeAllMail: scope.allMailScope,
        });
        writeInboxCache(cacheKey, next);
        return next;
      });
    },
    [activeProfileId, activeTab, includeAllMail, selectedMailFolder, setMessages]
  );

  const dismissMailAndAdvance = useCallback(
    (messageId: string) => {
      const next = pickNextAfter(messageId, filteredMessages);
      // Select next before removing so the "missing id" effect never clears selection.
      selectMessage(next);
      removeMessageFromInbox(messageId);
    },
    [filteredMessages, pickNextAfter, removeMessageFromInbox, selectMessage]
  );

  const handleMailFoldersChange = useCallback((folders: MailFolder[]) => {
    setMailFolders(folders);
  }, []);

  const moveMessageToMailFolder = useCallback(
    async (folderId: string) => {
      if (!selectedMessage || selectedMessage.kind !== "email") return;
      const providerMessageId = providerMessageIdFor(selectedMessage);
      if (!providerMessageId) {
        sonnerToast.error("Kunde inte flytta — saknar meddelande-id hos leverantören.");
        return;
      }
      setMoveBusy(true);
      try {
        await moveMessageToFolder({
          accountId: selectedMessage.accountId,
          messageId: providerMessageId,
          folderId,
          businessProfileId,
        });
        sonnerToast.success("Mailet flyttades till mappen.");
        dismissMailAndAdvance(selectedMessage.id);
      } catch (error) {
        sonnerToast.error(error instanceof Error ? error.message : "Kunde inte flytta mailet.");
      } finally {
        setMoveBusy(false);
      }
    },
    [businessProfileId, dismissMailAndAdvance, selectedMessage]
  );

  const performSelectedMailAction = useCallback(
    async (action: MailMessageAction) => {
      if (!selectedMessage || selectedMessage.kind !== "email") return;
      const providerMessageId = providerMessageIdFor(selectedMessage);
      if (!providerMessageId) {
        sonnerToast.error("Kunde inte utföra åtgärden — saknar meddelande-id.");
        return;
      }
      setMailActionBusy(true);
      try {
        const result = await performMailAction({
          accountId: selectedMessage.accountId,
          messageId: providerMessageId,
          action,
          businessProfileId,
        });
        if (action === "delete") {
          sonnerToast.success("Mailet raderades.");
          dismissMailAndAdvance(selectedMessage.id);
        } else if (action === "archive") {
          sonnerToast.success("Mailet arkiverades.");
          dismissMailAndAdvance(selectedMessage.id);
        } else if (action === "flag" || action === "unflag") {
          const starred = result.starred ?? action === "flag";
          setMessages((prev) =>
            prev.map((msg) => (msg.id === selectedMessage.id ? { ...msg, isStarred: starred } : msg))
          );
          sonnerToast.success(starred ? "Mailet flaggades." : "Flaggan togs bort.");
        }
      } catch (error) {
        sonnerToast.error(error instanceof Error ? error.message : "Kunde inte utföra åtgärden.");
      } finally {
        setMailActionBusy(false);
      }
    },
    [businessProfileId, dismissMailAndAdvance, selectedMessage, setMessages]
  );

  return {
    mailFolders,
    moveBusy,
    mailActionBusy,
    handleMailFoldersChange,
    moveMessageToMailFolder,
    performSelectedMailAction,
  };
}
