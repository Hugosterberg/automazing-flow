import type { MailFolderSelection } from "./types";

/** Pure builder for unified inbox fetch/cache args — extracted from Messages page. */
export function buildInboxLoadScope(args: {
  activeTab: string;
  selectedMailFolder: MailFolderSelection | null;
  includeAllMail: boolean;
}): {
  folderScoped: boolean;
  allMailScope: boolean;
  mailAccountId: string | null;
  mailFolderId: string | null;
} {
  const folderScoped = Boolean(args.activeTab === "mail" && args.selectedMailFolder);
  const allMailScope = args.activeTab === "mail" && !folderScoped && args.includeAllMail;
  return {
    folderScoped,
    allMailScope,
    mailAccountId:
      folderScoped && args.selectedMailFolder ? args.selectedMailFolder.accountId : null,
    mailFolderId:
      folderScoped && args.selectedMailFolder ? args.selectedMailFolder.folderId : null,
  };
}
