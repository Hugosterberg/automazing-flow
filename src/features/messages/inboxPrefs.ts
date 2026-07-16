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
  mailViewFilter?: MailViewFilter;
  mailSort?: MailSortOrder;
  triageBucket?: TriageBucketFilter;
};
