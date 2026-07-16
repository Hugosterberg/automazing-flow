import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/apiJson";
import { UNREAD_DM_KEY } from "@/features/daily-brief/useUnreadDmCount";
import { providerMessageIdFor } from "./messagesUi";
import type { UnifiedMessage } from "./types";

type Args = {
  selectedMessage: UnifiedMessage | null;
  activeProfileId: string | null | undefined;
  /** Late-bound: read at send time so this hook can run before filtered list exists. */
  getFilteredMessages: () => UnifiedMessage[];
  pickNextAfter: (fromId: string, list: UnifiedMessage[]) => UnifiedMessage | null;
  selectMessage: (msg: UnifiedMessage | null) => void;
  markHandled: (ids: string[], opts?: { silent?: boolean }) => void;
  /** Called when draft cache is restored for a newly selected message (AI assist glue). */
  onDraftRestored?: (messageId: string, cachedDraft: string | null) => void;
};

/**
 * Reply draft text, draft cache across selection hops, and send-reply.
 */
export function useMessageReply({
  selectedMessage,
  activeProfileId,
  getFilteredMessages,
  pickNextAfter,
  selectMessage,
  markHandled,
  onDraftRestored,
}: Args) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyDraft, setReplyDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const replyDraftCache = useRef<Map<string, string>>(new Map());
  const onDraftRestoredRef = useRef(onDraftRestored);
  onDraftRestoredRef.current = onDraftRestored;
  const getFilteredMessagesRef = useRef(getFilteredMessages);
  getFilteredMessagesRef.current = getFilteredMessages;
  const pickNextAfterRef = useRef(pickNextAfter);
  pickNextAfterRef.current = pickNextAfter;

  // Restore reply draft cache and reset transient send state when switching messages.
  useEffect(() => {
    if (!selectedMessage?.id) return;
    const cached = replyDraftCache.current.get(selectedMessage.id) ?? null;
    setReplyDraft(cached ?? "");
    setReplySent(false);
    setSendBusy(false);
    onDraftRestoredRef.current?.(selectedMessage.id, cached);
  }, [selectedMessage?.id]);

  useEffect(() => {
    if (!selectedMessage?.id || replySent) return;
    if (replyDraft.trim()) replyDraftCache.current.set(selectedMessage.id, replyDraft);
    else replyDraftCache.current.delete(selectedMessage.id);
  }, [replyDraft, replySent, selectedMessage?.id]);

  const sendReply = useCallback(async () => {
    if (!selectedMessage || !replyDraft.trim()) return;
    const messageId = providerMessageIdFor(selectedMessage);
    if (selectedMessage.kind === "email" && !messageId) {
      toast({
        title: "Kunde inte skicka svar",
        description: "E-postmeddelandet saknar provider-id. Uppdatera inkorgen och försök igen.",
        variant: "destructive",
      });
      return;
    }
    if (selectedMessage.kind === "dm" && !selectedMessage.conversationId) return;
    const sentId = selectedMessage.id;
    const nextAfterSend = pickNextAfterRef.current(sentId, getFilteredMessagesRef.current());
    setSendBusy(true);
    try {
      await apiJson("/api/messages/reply", "Kunde inte skicka svar", {
        body: {
          accountId: selectedMessage.accountId,
          conversationId: selectedMessage.kind === "dm" ? selectedMessage.conversationId : undefined,
          messageId: selectedMessage.kind === "email" ? messageId : undefined,
          message: replyDraft.trim(),
          business_profile_id: selectedMessage.profileId || activeProfileId,
        },
      });
      setReplySent(true);
      replyDraftCache.current.delete(sentId);
      selectMessage(nextAfterSend);
      markHandled([sentId], { silent: true });
      void queryClient.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      sonnerToast.success(
        selectedMessage.kind === "email"
          ? `Svar skickat via ${selectedMessage.channel === "gmail" ? "Gmail" : "Outlook"}`
          : "Svar skickat"
      );
    } catch (e) {
      toast({
        title: "Kunde inte skicka svar",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setSendBusy(false);
    }
  }, [activeProfileId, markHandled, queryClient, replyDraft, selectMessage, selectedMessage, toast]);

  return {
    replyDraft,
    setReplyDraft,
    sendBusy,
    replySent,
    sendReply,
  };
}
