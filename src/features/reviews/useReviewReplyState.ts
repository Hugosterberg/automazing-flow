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
 * How old the cached count may get before a re-sync is worth a write. The
 * daily brief only cares that the value is fresher than STALE_MS, so
 * refreshing far more often than that is pure write amplification.
 */
const RESYNC_AFTER_MS = 10 * 60 * 1000;
/**
 * Cap on remembered reply ids. A Judge.me store can accumulate thousands of
 * reviews, and this document is loaded on every Reviews render — the newest
 * ids are the only ones that can still match a fetched review anyway.
 */
const MAX_REPLIED_IDS = 2000;

/**
 * Whether caching the pending count is worth a write.
 *
 * Pulled out as a pure function because getting this wrong is expensive:
 * callers invoke the sync from an effect whose dependencies change on every
 * render, so an unconditional write turns into a render→save→render loop that
 * hammers `profile_documents` for as long as the page is open.
 */
export function shouldSyncPendingCount(args: {
  pending: number;
  storedCount: number;
  updatedAt: string | null;
  now?: number;
}): boolean {
  if (args.pending !== args.storedCount) return true;
  const lastSyncedAt = args.updatedAt ? Date.parse(args.updatedAt) : NaN;
  if (!Number.isFinite(lastSyncedAt)) return true;
  return (args.now ?? Date.now()) - lastSyncedAt >= RESYNC_AFTER_MS;
}

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
        repliedIds: [...doc.data.repliedIds, reviewId].slice(-MAX_REPLIED_IDS),
        pendingCount: Math.max(0, doc.data.pendingCount - 1),
        updatedAt: doc.data.updatedAt,
      });
    },
    [doc, repliedSet]
  );

  /** Cache the unreplied count for the daily brief — see shouldSyncPendingCount. */
  const syncPendingCount = useCallback(
    (reviewIds: string[]) => {
      const pending = reviewIds.filter((id) => !repliedSet.has(id)).length;
      if (
        !shouldSyncPendingCount({
          pending,
          storedCount: doc.data.pendingCount,
          updatedAt: doc.data.updatedAt,
        })
      ) {
        return;
      }
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
