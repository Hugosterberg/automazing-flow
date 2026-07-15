import { apiJson } from "@/lib/apiJson";
import type { MailFolder } from "./types";

export async function fetchMailFolders(
  accountId: string,
  businessProfileId?: string | null,
  signal?: AbortSignal
): Promise<MailFolder[]> {
  const params = new URLSearchParams({ accountId });
  if (businessProfileId) params.set("business_profile_id", businessProfileId);
  const payload = await apiJson<{ folders?: MailFolder[] }>(
    `/api/messages/folders?${params.toString()}`,
    "Kunde inte hämta mailmappar.",
    { signal }
  );
  return Array.isArray(payload.folders) ? payload.folders : [];
}

export async function createMailFolder(args: {
  accountId: string;
  name: string;
  businessProfileId?: string | null;
}): Promise<MailFolder> {
  const payload = await apiJson<{ folder?: MailFolder }>(
    "/api/messages/folders",
    "Kunde inte skapa mappen.",
    {
      body: {
        accountId: args.accountId,
        name: args.name,
        ...(args.businessProfileId ? { business_profile_id: args.businessProfileId } : {}),
      },
    }
  );
  if (!payload.folder?.id) {
    throw new Error("Mappen skapades utan id.");
  }
  return payload.folder;
}

export async function moveMessageToFolder(args: {
  accountId: string;
  messageId: string;
  folderId: string;
  businessProfileId?: string | null;
}): Promise<void> {
  await apiJson(
    "/api/messages/move",
    "Kunde inte flytta meddelandet.",
    {
      body: {
        accountId: args.accountId,
        messageId: args.messageId,
        folderId: args.folderId,
        ...(args.businessProfileId ? { business_profile_id: args.businessProfileId } : {}),
      },
    }
  );
}
