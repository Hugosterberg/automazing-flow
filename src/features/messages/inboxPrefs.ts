import type {
  InboxFilter,
  MessageChannelTab,
  MailFolderSelection,
  MailViewFilter,
  MailSortOrder,
  TriageBucketFilter,
} from "./types";

export type InboxPrefs = {
  filter?: InboxFilter;
  tab?: MessageChannelTab;
  mailFolder?: MailFolderSelection | null;
  /** When true, list recent mail across folders/labels (not only provider Inbox). */
  includeAllMail?: boolean;
  mailViewFilter?: MailViewFilter;
  mailSort?: MailSortOrder;
  triageBucket?: TriageBucketFilter;
};
