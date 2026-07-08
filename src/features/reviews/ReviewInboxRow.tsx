import { forwardRef } from "react";
import { Circle, ExternalLink, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewItem } from "./types";

type Props = {
  review: ReviewItem;
  selected: boolean;
  needsReply: boolean;
  formattedDate: string;
  senderInitial: string;
  avatarClass: string;
  onSelect: () => void;
};

function Stars({ rating }: { rating?: number }) {
  if (rating == null) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-3 w-3", i < rating ? "fill-current" : "fill-none opacity-30")}
          aria-hidden
        />
      ))}
    </span>
  );
}

export const ReviewInboxRow = forwardRef<HTMLButtonElement, Props>(function ReviewInboxRow(
  { review, selected, needsReply, formattedDate, senderInitial, avatarClass, onSelect },
  ref
) {
  const snippet = (review.text || "No text").slice(0, 120);

  return (
    <div
      className={cn(
        "group relative border-b border-border/60 last:border-b-0",
        selected && "bg-primary/5",
        needsReply && !selected && "bg-primary/[0.03]"
      )}
    >
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full px-3 py-3 text-left transition-all duration-150 ease-out",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected && "border-l-[3px] border-l-primary bg-primary/5 pl-[calc(0.75rem-2px)] ring-1 ring-inset ring-primary/10",
          needsReply && !selected && "border-l-2 border-l-primary/50"
        )}
        aria-current={selected ? "true" : undefined}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
              avatarClass
            )}
          >
            {senderInitial}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={cn("truncate text-sm", needsReply ? "font-semibold" : "font-medium text-muted-foreground")}>
                {review.author || "Anonymous"}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formattedDate}</span>
            </div>
            <div className="mb-1 flex items-center gap-2">
              <Stars rating={review.rating} />
              {review.rating != null ? (
                <span className="text-[10px] text-muted-foreground tabular-nums">{review.rating}/5</span>
              ) : null}
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{snippet}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {needsReply ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Circle className="h-2 w-2 fill-primary text-primary" aria-hidden />
                  Needs reply
                </span>
              ) : (
                <span className="text-[10px] text-emerald-600">Replied</span>
              )}
            </div>
          </div>
        </div>
      </button>
      {review.url ? (
        <a
          href={review.url}
          target="_blank"
          rel="noreferrer"
          className="absolute right-2 top-3 text-muted-foreground opacity-100 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open review externally"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
});
