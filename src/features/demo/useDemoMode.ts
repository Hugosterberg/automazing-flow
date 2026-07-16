import { useCallback } from "react";
import { useProfileDocument } from "@/features/profile-documents";
import type { MailReplyQueueItem } from "@/features/messages/MailReplyDraftsStrip";
import {
  OUTREACH_QUEUE_DOC_KEY,
  type OutreachQueueItem,
} from "@/features/outreach/outreachQueueTypes";
import type { ReviewReplyQueueItem } from "@/features/reviews/ReviewReplyQueueSection";
import {
  DEMO_MODE_DOC_KEY,
  isDemoId,
  type DemoModeDoc,
} from "./demoMode";
import {
  buildDemoDmDrafts,
  buildDemoMailDrafts,
  buildDemoOutreachDrafts,
  buildDemoReviewDrafts,
} from "./sampleData";

function pendingStatus(status?: string) {
  return status === "draft" || status === "drafted" || !status;
}

/**
 * Client-only sandbox: flag + one-shot seed of draft queues (profile documents).
 */
export function useDemoMode() {
  const doc = useProfileDocument<DemoModeDoc>(DEMO_MODE_DOC_KEY, { enabled: false });
  const mailDoc = useProfileDocument<MailReplyQueueItem[]>("mail-reply-queue", []);
  const outreachDoc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  const reviewDoc = useProfileDocument<ReviewReplyQueueItem[]>("review-reply-queue", []);

  const enabled = Boolean(doc.data?.enabled);
  const dmDrafts = enabled ? doc.data?.dmDrafts ?? [] : [];

  const enable = useCallback(() => {
    const mail = Array.isArray(mailDoc.data) ? mailDoc.data : [];
    const outreach = Array.isArray(outreachDoc.data) ? outreachDoc.data : [];
    const review = Array.isArray(reviewDoc.data) ? reviewDoc.data : [];

    if (!mail.some((i) => pendingStatus(i.status))) {
      mailDoc.save([...buildDemoMailDrafts(), ...mail.filter((i) => !isDemoId(i.id))]);
    }
    if (!outreach.some((i) => pendingStatus(i.status))) {
      outreachDoc.save([...buildDemoOutreachDrafts(), ...outreach.filter((i) => !isDemoId(i.id))]);
    }
    if (!review.some((i) => pendingStatus(i.status))) {
      reviewDoc.save([...buildDemoReviewDrafts(), ...review.filter((i) => !isDemoId(i.id))]);
    }

    doc.save({
      enabled: true,
      seededAt: new Date().toISOString(),
      dmDrafts: buildDemoDmDrafts(),
    });
  }, [doc, mailDoc, outreachDoc, reviewDoc]);

  const disable = useCallback(() => {
    const mail = Array.isArray(mailDoc.data) ? mailDoc.data : [];
    const outreach = Array.isArray(outreachDoc.data) ? outreachDoc.data : [];
    const review = Array.isArray(reviewDoc.data) ? reviewDoc.data : [];
    mailDoc.save(mail.filter((i) => !isDemoId(i.id)));
    outreachDoc.save(outreach.filter((i) => !isDemoId(i.id)));
    reviewDoc.save(review.filter((i) => !isDemoId(i.id)));
    doc.save({
      enabled: false,
      seededAt: doc.data?.seededAt ?? null,
      dmDrafts: [],
    });
  }, [doc, mailDoc, outreachDoc, reviewDoc]);

  const dismissDmDraft = useCallback(
    (id: string) => {
      if (!isDemoId(id)) return;
      const next = (doc.data?.dmDrafts ?? []).filter((d) => d.id !== id);
      doc.save({
        ...doc.data,
        enabled: true,
        dmDrafts: next,
      });
    },
    [doc]
  );

  return {
    enabled,
    isLoading: doc.isLoading,
    dmDrafts,
    enable,
    disable,
    dismissDmDraft,
  };
}
