import { useMemo } from "react";
import { formatWaitTime, messageMatchesTab, MESSAGE_TABS } from "./messagesUi";
import { classifyMessageTriage, compareByTriage, countByTriageBucket } from "./messageTriage";
import { isSnoozed, type SnoozeMap } from "./messageSnooze";
import type {
  InboxFilter,
  MailSortOrder,
  MailViewFilter,
  MessageChannelTab,
  TriageBucketFilter,
  UnifiedMessage,
} from "./types";

type Args = {
  messages: UnifiedMessage[];
  activeTab: MessageChannelTab;
  inboxFilter: InboxFilter;
  debouncedInboxSearch: string;
  mailViewFilter: MailViewFilter;
  mailSort: MailSortOrder;
  triageBucket: TriageBucketFilter;
  handledIds: Set<string>;
  snoozeMap: SnoozeMap;
  isUnanswered: (msg: UnifiedMessage) => boolean;
  isVisuallyUnread: (msg: UnifiedMessage) => boolean;
  aiSummaries: Record<string, string>;
};

/**
 * Derived inbox list, triage bucket counts, and channel-tab stats.
 * Pure filtering/sorting — page keeps selection and side-effect wiring.
 */
export function useFilteredInbox({
  messages,
  activeTab,
  inboxFilter,
  debouncedInboxSearch,
  mailViewFilter,
  mailSort,
  triageBucket,
  handledIds,
  snoozeMap,
  isUnanswered,
  isVisuallyUnread,
  aiSummaries,
}: Args) {
  const filteredMessages = useMemo(() => {
    const q = debouncedInboxSearch.trim().toLowerCase();
    const rows = messages
      .filter((msg) => messageMatchesTab(msg, activeTab))
      .filter((msg) => {
        if (inboxFilter === "open") return isUnanswered(msg);
        if (inboxFilter === "handled") return handledIds.has(msg.id);
        return true;
      })
      .filter((msg) => {
        // Snoozed messages leave the work queues until they resurface.
        if (inboxFilter === "handled" || inboxFilter === "all") return true;
        return !isSnoozed(snoozeMap, msg.id);
      })
      .filter((msg) => {
        if (activeTab !== "mail" || mailViewFilter === "all") return true;
        if (mailViewFilter === "unread") return isVisuallyUnread(msg);
        if (mailViewFilter === "starred") return Boolean(msg.isStarred);
        return true;
      })
      .filter((msg) => {
        if (triageBucket === "all") return true;
        return classifyMessageTriage(msg).bucket === triageBucket;
      })
      .filter((msg) => {
        if (!q) return true;
        const haystack = [
          msg.subject,
          msg.from.name,
          msg.from.email,
          msg.snippet,
          msg.body,
          msg.accountLabel,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    return rows.sort((a, b) => {
      if (mailSort === "newest" || mailSort === "oldest") {
        const aDate = Date.parse(a.date) || 0;
        const bDate = Date.parse(b.date) || 0;
        return mailSort === "oldest" ? aDate - bDate : bDate - aDate;
      }
      // Default "triage": action buckets first, then open-before-handled.
      const triageCmp = compareByTriage(a, b);
      if (triageCmp !== 0) return triageCmp;
      const aOpen = isUnanswered(a);
      const bOpen = isUnanswered(b);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return 0;
    });
  }, [
    activeTab,
    messages,
    inboxFilter,
    debouncedInboxSearch,
    isUnanswered,
    isVisuallyUnread,
    handledIds,
    mailViewFilter,
    mailSort,
    triageBucket,
    snoozeMap,
  ]);

  const triageCounts = useMemo(() => {
    const inTab = messages
      .filter((msg) => messageMatchesTab(msg, activeTab))
      .filter((msg) => {
        if (inboxFilter === "open") return isUnanswered(msg);
        if (inboxFilter === "handled") return handledIds.has(msg.id);
        if (inboxFilter === "queue") return true;
        return true;
      });
    return countByTriageBucket(inTab);
  }, [messages, activeTab, inboxFilter, isUnanswered, handledIds]);

  const unansweredInTab = useMemo(
    () => messages.filter((msg) => messageMatchesTab(msg, activeTab) && isUnanswered(msg)),
    [messages, activeTab, isUnanswered]
  );

  const inboxStats = useMemo(() => {
    const open = unansweredInTab;
    let oldestWait: string | null = null;
    if (open.length > 0) {
      const oldest = open.reduce((a, b) => (Date.parse(a.date) < Date.parse(b.date) ? a : b));
      oldestWait = formatWaitTime(oldest.date);
    }
    const aiReadyCount = open.filter((m) => Boolean(aiSummaries[m.id])).length;
    return { openCount: open.length, oldestWait, aiReadyCount };
  }, [unansweredInTab, aiSummaries]);

  const inboxLiveHint = useMemo(() => {
    if (triageCounts.today > 0) {
      return `${triageCounts.today} att svara idag · ${triageCounts.week} denna vecka · filtrera hinkarna ovanför listan`;
    }
    if (inboxStats.openCount === 0) return null;
    const parts = [`${inboxStats.openCount} öppna i inkorgen`];
    if (inboxStats.oldestWait) parts.push(`äldsta väntar ${inboxStats.oldestWait}`);
    if (inboxStats.aiReadyCount > 0) parts.push(`${inboxStats.aiReadyCount} med AI-utkast klara`);
    return parts.join(" · ");
  }, [inboxStats, triageCounts]);

  const tabCounts = useMemo(
    () =>
      MESSAGE_TABS.reduce(
        (acc, tab) => {
          const rows = messages.filter((msg) => messageMatchesTab(msg, tab.value));
          acc[tab.value] = {
            total: rows.length,
            unread: rows.filter(isUnanswered).length,
          };
          return acc;
        },
        {} as Record<MessageChannelTab, { total: number; unread: number }>
      ),
    [messages, isUnanswered]
  );

  const hasMessagesInTab = useMemo(
    () => messages.some((msg) => messageMatchesTab(msg, activeTab)),
    [messages, activeTab]
  );

  const openTotal = unansweredInTab.length;

  return {
    filteredMessages,
    triageCounts,
    unansweredInTab,
    inboxStats,
    inboxLiveHint,
    tabCounts,
    hasMessagesInTab,
    openTotal,
  };
}
