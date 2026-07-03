import { useCallback, useMemo } from "react";
import { useProfileDocument } from "@/features/profile-documents";

export type ReviewReplyState = {
  repliedIds: string[];
  /** Last computed unreplied count (synced when Reviews page loads). */
  pendingCount: number;
  updatedAt: string | null;
};

const EMPTY: ReviewReplyState = { repliedIds: [], pendingCount: 0, updatedAt: null };

const STALE_MS = 48 * 60 * 60 * 1000;

/**
 * Tracks which reviews the user has replied to (per business profile) and
 * caches the pending-reply count for the home daily brief.
 */
export function useReviewReplyState(businessProfileId: string | null | undefined) {
  const doc = useProfileDocument<ReviewReplyState>("review-replies", EMPTY);

  const repliedSet = useMemo(() => new Set(doc.data.repliedIds), [doc.data.repliedIds]);

  const markReplied = useCallback(
    (reviewId: string) => {
      if (repliedSet.has(reviewId)) return;
      doc.save({
        ...doc.data,
        repliedIds: [...doc.data.repliedIds, reviewId],
        pendingCount: Math.max(0, doc.data.pendingCount - 1),
        updatedAt: doc.data.updatedAt,
      });
    },
    [doc, repliedSet]
  );

  const syncPendingCount = useCallback(
    (reviewIds: string[]) => {
      const pending = reviewIds.filter((id) => !repliedSet.has(id)).length;
      doc.save({
        repliedIds: doc.data.repliedIds,
        pendingCount: pending,
        updatedAt: new Date().toISOString(),
      });
    },
    [doc, repliedSet]
  );

  const briefPendingCount = useMemo(() => {
    if (!doc.data.updatedAt) return 0;
    const age = Date.now() - Date.parse(doc.data.updatedAt);
    if (!Number.isFinite(age) || age > STALE_MS) return 0;
    return Math.max(0, doc.data.pendingCount);
  }, [doc.data.pendingCount, doc.data.updatedAt]);

  return {
    repliedIds: repliedSet,
    markReplied,
    syncPendingCount,
    briefPendingCount,
  };
}
