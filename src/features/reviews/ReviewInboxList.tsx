import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewInboxRow } from "./ReviewInboxRow";
import type { ReviewItem } from "./types";

type RowMeta = {
  needsReply: boolean;
  formattedDate: string;
  senderInitial: string;
  avatarClass: string;
};

type Props = {
  reviews: ReviewItem[];
  selectedId: string | null;
  loading: boolean;
  needsReplyCount?: number;
  emptyTitle: string;
  emptyDescription: string;
  getRowMeta: (review: ReviewItem) => RowMeta;
  onSelect: (review: ReviewItem) => void;
};

export function ReviewInboxList({
  reviews,
  selectedId,
  loading,
  needsReplyCount = 0,
  emptyTitle,
  emptyDescription,
  getRowMeta,
  onSelect,
}: Props) {
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, reviews.length]);

  return (
    <>
      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground/80">
            {loading ? "Loading reviews…" : `${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
          </p>
          {!loading && needsReplyCount > 0 ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
              {needsReplyCount} open
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {loading ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-3">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-secondary" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 w-2/5 animate-pulse rounded bg-secondary" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/70" />
                </div>
              </div>
            ))}
          </div>
        ) : reviews.length > 0 ? (
          <div className="divide-y divide-border/60">
            {reviews.map((review) => {
              const meta = getRowMeta(review);
              return (
                <ReviewInboxRow
                  key={review.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(review.id, el);
                    else rowRefs.current.delete(review.id);
                  }}
                  review={review}
                  selected={selectedId === review.id}
                  needsReply={meta.needsReply}
                  formattedDate={meta.formattedDate}
                  senderInitial={meta.senderInitial}
                  avatarClass={meta.avatarClass}
                  onSelect={() => onSelect(review)}
                />
              );
            })}
          </div>
        ) : (
          <div className="p-6">
            <EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} />
          </div>
        )}
      </div>
    </>
  );
}
