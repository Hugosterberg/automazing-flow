import { useEffect, useRef, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewInboxRow } from "./ReviewInboxRow";
import type { ReviewItem } from "./types";

type RowMeta = {
  needsReply: boolean;
  formattedDate: string;
  fullDate: string;
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
  emptyAction?: ReactNode;
  emptySecondaryAction?: ReactNode;
  getRowMeta: (review: ReviewItem) => RowMeta;
  onSelect: (review: ReviewItem) => void;
  searchQuery?: string;
};

export function ReviewInboxList({
  reviews,
  selectedId,
  loading,
  needsReplyCount = 0,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptySecondaryAction,
  getRowMeta,
  onSelect,
  searchQuery = "",
}: Props) {
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, reviews.length]);

  return (
    <div className="message-inbox-pane flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <p className="text-[11px] font-medium text-foreground/80">
          {loading ? "Laddar recensioner…" : "Recensioner"}
        </p>
        {!loading && reviews.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-muted-foreground">{reviews.length} st</span>
            {needsReplyCount > 0 ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                {needsReplyCount} öppna
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {loading ? (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2.5 shimmer">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted/60" />
                <div className="flex-1 space-y-1.5 py-0.5">
                  <div className="flex justify-between gap-2">
                    <div className="h-2.5 w-2/5 rounded bg-muted/60" />
                    <div className="h-2.5 w-8 rounded bg-muted/40" />
                  </div>
                  <div className="h-2 w-16 rounded bg-muted/50" />
                  <div className="h-2.5 w-4/5 rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        ) : reviews.length > 0 ? (
          <div>
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
                  fullDate={meta.fullDate}
                  senderInitial={meta.senderInitial}
                  avatarClass={meta.avatarClass}
                  onSelect={() => onSelect(review)}
                  searchQuery={searchQuery}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6">
            <EmptyState
              icon={MessageSquare}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
              secondaryAction={emptySecondaryAction}
              size="compact"
            />
          </div>
        )}
      </div>
    </div>
  );
}
