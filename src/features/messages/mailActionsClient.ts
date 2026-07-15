import { apiJson } from "@/lib/apiJson";

export type MailMessageAction = "delete" | "archive" | "flag" | "unflag";

export async function performMailAction(args: {
  accountId: string;
  messageId: string;
  action: MailMessageAction;
  businessProfileId?: string | null;
}): Promise<{ starred?: boolean }> {
  return apiJson<{ ok?: boolean; starred?: boolean }>(
    "/api/messages/action",
    actionErrorLabel(args.action),
    {
      body: {
        accountId: args.accountId,
        messageId: args.messageId,
        action: args.action,
        ...(args.businessProfileId ? { business_profile_id: args.businessProfileId } : {}),
      },
    }
  );
}

function actionErrorLabel(action: MailMessageAction): string {
  switch (action) {
    case "delete":
      return "Kunde inte radera mailet.";
    case "archive":
      return "Kunde inte arkivera mailet.";
    case "flag":
      return "Kunde inte flagga mailet.";
    case "unflag":
      return "Kunde inte ta bort flaggan.";
    default:
      return "Kunde inte utföra åtgärden.";
  }
}
