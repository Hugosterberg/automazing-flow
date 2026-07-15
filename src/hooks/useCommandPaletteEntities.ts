import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useProfileDocument } from "@/features/profile-documents";
import { guessPrimaryColumn, guessSecondaryColumn } from "@/features/customers/customerColumns";
import { fetchUnifiedMessagesPreview } from "@/features/messages/messagesClient";
import {
  OUTREACH_QUEUE_DOC_KEY,
  pendingOutreachItems,
  type OutreachQueueItem,
} from "@/features/outreach/outreachQueueTypes";
import { useTasks, isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks";
import {
  useLeads,
  isLeadOpen,
  isFollowUpOverdue,
  isFollowUpDueToday,
} from "@/features/leads";
import { useReviewReplyState, fetchReviewsPreview, type ReviewPreview } from "@/features/reviews";
import { useAutomationRuns, automationCatalog } from "@/features/automation";
import { useScheduledPosts } from "@/features/social";
import { isoToLocalDateInputValue } from "@/lib/localDate";
import type { CalendarEvent } from "@/types/calendar";

type CustomerStoragePayload = { columns: string[]; rows: Record<string, string>[]; fileName: string };

export type CommandEntity = {
  id: string;
  label: string;
  description: string;
  to: string;
  kind: "task" | "lead" | "outreach" | "message" | "customer" | "review" | "automation" | "event";
};

function leadEntityTo(leadId: string, due: boolean): string {
  return due ? `/sales?view=followups&lead=${encodeURIComponent(leadId)}` : `/sales?lead=${encodeURIComponent(leadId)}`;
}

/**
 * Lightweight entity index for ⌘K — tasks, leads, outreach, inbox, customers.
 */
export function useCommandPaletteEntities(paletteOpen = false): CommandEntity[] {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { accounts } = useAccounts();
  const { tasks } = useTasks(businessProfileId);
  const { leads } = useLeads(businessProfileId);
  const outreachDoc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  // Same handled/read triage as the Messages inbox (src/pages/Messages.tsx) so
  // the "Oläst" label here doesn't disagree with what the inbox itself shows.
  const messagesHandledDoc = useProfileDocument<string[]>("messages-handled", []);
  const messagesReadDoc = useProfileDocument<string[]>("messages-read", []);
  const customersDoc = useProfileDocument<CustomerStoragePayload>("customers", {
    columns: [],
    rows: [],
    fileName: "",
  });
  const { briefPendingCount: reviewsPending, repliedIds } = useReviewReplyState(businessProfileId);
  const automationRuns = useAutomationRuns(businessProfileId);
  const calendarDoc = useProfileDocument<CalendarEvent[]>("calendar-events", []);
  const { posts: scheduledPosts } = useScheduledPosts();
  const [inboxMessages, setInboxMessages] = useState<Awaited<ReturnType<typeof fetchUnifiedMessagesPreview>>>([]);
  const [reviewPreviews, setReviewPreviews] = useState<ReviewPreview[]>([]);

  useEffect(() => {
    if (!paletteOpen || !businessProfileId) {
      setInboxMessages([]);
      return;
    }
    const ac = new AbortController();
    void fetchUnifiedMessagesPreview(businessProfileId, ac.signal)
      .then(setInboxMessages)
      .catch(() => setInboxMessages([]));
    return () => ac.abort();
  }, [paletteOpen, businessProfileId]);

  useEffect(() => {
    if (!paletteOpen || !businessProfileId) {
      setReviewPreviews([]);
      return;
    }
    const ac = new AbortController();
    void fetchReviewsPreview(accounts, businessProfileId, repliedIds, ac.signal)
      .then(setReviewPreviews)
      .catch(() => setReviewPreviews([]));
    return () => ac.abort();
  }, [paletteOpen, businessProfileId, accounts, repliedIds]);

  return useMemo(() => {
    const rows: CommandEntity[] = [];
    const nowMs = Date.now();
    const todayKey = isoToLocalDateInputValue(new Date().toISOString());

    for (const ev of (Array.isArray(calendarDoc.data) ? calendarDoc.data : []).filter((e) => e.date === todayKey).slice(0, 4)) {
      rows.push({
        id: `cal-ev-${ev.id}`,
        label: ev.title,
        description: "Calendar · today",
        to: "/calendar",
        kind: "event",
      });
    }

    for (const post of scheduledPosts
      .filter((p) => p.scheduledFor && isoToLocalDateInputValue(p.scheduledFor) === todayKey)
      .slice(0, 4)) {
      rows.push({
        id: `cal-post-${post.id}`,
        label: (post.caption.trim() || "Scheduled post").slice(0, 60),
        description: "Publish · today",
        to: `/social-media?post=${encodeURIComponent(post.id)}`,
        kind: "event",
      });
    }

    if (reviewPreviews.length > 0) {
      for (const review of reviewPreviews) {
        const snippet = review.text.trim().replace(/\s+/g, " ").slice(0, 72);
        rows.push({
          id: `review-${review.id}`,
          label: review.author,
          description: review.rating
            ? `Recension · ${review.rating}★ · ${snippet || "behöver svar"}`
            : `Recension · ${snippet || "behöver svar"}`,
          to: `/reviews?id=${encodeURIComponent(review.id)}&filter=needs_reply`,
          kind: "review",
        });
      }
    } else if (reviewsPending > 0) {
      rows.push({
        id: "reviews-pending",
        label: reviewsPending === 1 ? "1 recension behöver svar" : `${reviewsPending} recensioner behöver svar`,
        description: "Recensioner · behöver svar",
        to: "/reviews?filter=needs_reply",
        kind: "review",
      });
    }

    for (const entry of automationCatalog) {
      if (!entry.cronKey) continue;
      const run = automationRuns.byKey[entry.cronKey];
      if (run?.lastRun?.status !== "failed") continue;
      rows.push({
        id: `automation-failed-${entry.cronKey}`,
        label: entry.title,
        description: "Automation · misslyckad körning",
        to: `/automations#automation-${entry.cronKey}`,
        kind: "automation",
      });
      if (rows.filter((r) => r.kind === "automation").length >= 4) break;
    }

    const dealtWithMessageIds = new Set([
      ...(Array.isArray(messagesHandledDoc.data) ? messagesHandledDoc.data : []),
      ...(Array.isArray(messagesReadDoc.data) ? messagesReadDoc.data : []),
    ]);
    for (const msg of inboxMessages) {
      const stillUnread = msg.isUnread && !dealtWithMessageIds.has(msg.id);
      rows.push({
        id: `msg-${msg.id}`,
        label: msg.subject || msg.from?.name || "Meddelande",
        description: stillUnread ? `Oläst · ${msg.channel}` : msg.channel,
        to: `/messages?id=${encodeURIComponent(msg.id)}`,
        kind: "message",
      });
    }

    const dueLeads = leads.filter(
      (l) =>
        isLeadOpen(l.status) &&
        (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs))
    );

    for (const lead of dueLeads.slice(0, 10)) {
      const overdue = isFollowUpOverdue(lead.nextFollowUpAt, nowMs);
      rows.push({
        id: `lead-due-${lead.id}`,
        label: lead.company,
        description: overdue ? "Lead · försenad uppföljning" : "Lead · uppföljning idag",
        to: leadEntityTo(lead.id, true),
        kind: "lead",
      });
    }

    const openTasks = tasks.filter(isTaskOpen);
    const overdueTasks = openTasks.filter((t) => isTaskOverdue(t));
    const todayTasks = openTasks.filter((t) => !isTaskOverdue(t) && isTaskDueToday(t));
    const otherTasks = openTasks.filter((t) => !isTaskOverdue(t) && !isTaskDueToday(t));

    for (const task of [...overdueTasks, ...todayTasks, ...otherTasks].slice(0, 12)) {
      const overdue = isTaskOverdue(task);
      const today = isTaskDueToday(task);
      rows.push({
        id: `task-${task.id}`,
        label: task.title || "Namnlös uppgift",
        description: overdue
          ? "Uppgift · försenad"
          : today
            ? "Uppgift · idag"
            : task.module
              ? `Uppgift · ${task.module}`
              : "Uppgift",
        to: `/tasks?task=${encodeURIComponent(task.id)}`,
        kind: "task",
      });
    }

    for (const item of pendingOutreachItems(outreachDoc.data).slice(0, 8)) {
      rows.push({
        id: `outreach-${item.id}`,
        label: item.leadName,
        description: item.subject ? `Outreach · ${item.subject}` : "Outreach-utkast",
        to: `/sales?view=outreach-queue&id=${encodeURIComponent(item.id)}`,
        kind: "outreach",
      });
    }

    for (const lead of leads.filter((l) => isLeadOpen(l.status)).slice(0, 15)) {
      if (dueLeads.some((d) => d.id === lead.id)) continue;
      rows.push({
        id: `lead-${lead.id}`,
        label: lead.contactName || lead.company || "Lead",
        description: `Lead · ${lead.company}`,
        to: leadEntityTo(lead.id, false),
        kind: "lead",
      });
      if (rows.filter((r) => r.kind === "lead").length >= 15) break;
    }

    const customerColumns = Array.isArray(customersDoc.data.columns) ? customersDoc.data.columns : [];
    const customerRows = Array.isArray(customersDoc.data.rows) ? customersDoc.data.rows : [];
    if (customerColumns.length > 0 && customerRows.length > 0) {
      const primary = guessPrimaryColumn(customerColumns);
      const secondary = guessSecondaryColumn(customerColumns, primary);
      for (const [index, row] of customerRows.slice(0, 10).entries()) {
        const title = (primary && row[primary]) || `Kund ${index + 1}`;
        const sub = secondary ? row[secondary] : "";
        rows.push({
          id: `customer-${index}`,
          label: title,
          description: sub ? `Kund · ${sub}` : "Kund",
          to: `/customers?index=${index}`,
          kind: "customer",
        });
      }
    }

    return rows.slice(0, 40);
  }, [
    tasks,
    leads,
    outreachDoc.data,
    customersDoc.data,
    inboxMessages,
    reviewsPending,
    reviewPreviews,
    automationRuns.byKey,
    calendarDoc.data,
    scheduledPosts,
    messagesHandledDoc.data,
    messagesReadDoc.data,
  ]);
}
