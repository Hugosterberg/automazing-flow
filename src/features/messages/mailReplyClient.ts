import { apiJson } from "@/lib/apiJson";
import type { MailReplyQueueItem } from "./MailReplyDraftsStrip";

/** Send a queued mail-reply draft via the existing messages reply API. */
export async function sendMailReplyDraft(args: {
  item: MailReplyQueueItem;
  businessProfileId: string | null | undefined;
  message?: string;
}): Promise<void> {
  const text = (args.message ?? args.item.draft).trim();
  if (!text) throw new Error("Utkastet är tomt.");
  await apiJson("/api/messages/reply", "Kunde inte skicka mail-svar", {
    body: {
      accountId: args.item.accountId,
      messageId: args.item.providerMessageId,
      message: text,
      business_profile_id: args.businessProfileId,
    },
  });
}
