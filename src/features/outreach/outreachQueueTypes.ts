/** Client mirror of server/lib/flowAutomationJobs outreach queue items. */
export interface OutreachQueueItem {
  id: string;
  leadId: string;
  leadName: string;
  prospectEmail?: string;
  subject?: string;
  body: string;
  status: "draft" | "sent";
  createdAt: string;
}

export const OUTREACH_QUEUE_DOC_KEY = "outreach-queue";

export function pendingOutreachItems(items: OutreachQueueItem[]): OutreachQueueItem[] {
  return items.filter((item) => item.status === "draft" || !item.status);
}
