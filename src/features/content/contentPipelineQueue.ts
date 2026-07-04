import { loadProfileDocument, saveProfileDocument } from "@/features/profile-documents/profileDocumentsService";

export const CONTENT_PIPELINE_DOC_KEY = "content-pipeline-queue";

export interface ContentPipelineItem {
  id: string;
  title: string;
  captionHint?: string;
  accountIds: string[];
  platforms: string[];
  mediaUrls: string[];
  scheduledFor: string;
  status: "queued" | "scheduled" | "failed";
  createdAt: string;
}

function defaultScheduleIso(hoursFromNow = 24): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

export async function enqueueContentPipelineItems(
  businessProfileId: string,
  items: Omit<ContentPipelineItem, "id" | "status" | "createdAt">[]
): Promise<number> {
  if (!businessProfileId || items.length === 0) return 0;
  const existing = (await loadProfileDocument<ContentPipelineItem[]>(businessProfileId, CONTENT_PIPELINE_DOC_KEY)) ?? [];
  const nowIso = new Date().toISOString();
  const nextItems: ContentPipelineItem[] = items.map((item, index) => ({
    ...item,
    id: crypto.randomUUID(),
    status: "queued",
    scheduledFor: item.scheduledFor || defaultScheduleIso(24 + index),
    createdAt: nowIso,
  }));
  await saveProfileDocument(businessProfileId, CONTENT_PIPELINE_DOC_KEY, [...nextItems, ...existing].slice(0, 50));
  return nextItems.length;
}
