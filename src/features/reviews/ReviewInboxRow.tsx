import { forwardRef } from "react";
import { Circle, ExternalLink, Star } from "lucide-react";
import { SearchHighlight } from "@/features/messages/SearchHighlight";
import { cn } from "@/lib/utils";
import type { ReviewItem } from "./types";

type Props = {
  review: ReviewItem;
  selected: boolean;
  needsReply: boolean;
  formattedDate: string;
  fullDate: string;
  senderInitial: string;
  avatarClass: string;
  onSelect: () => void;
  searchQuery?: string;
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
  { review, selected, needsReply, formattedDate, fullDate, senderInitial, avatarClass, onSelect, searchQuery = "" },
  ref
) {
  const snippet = (review.text || "Ingen text").slice(0, 120);

  return (
    <div
      className={cn(
        "group relative",
        selected && "bg-primary/[0.07]",
        needsReply && !selected && "bg-primary/[0.03]"
      )}
    >
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className={cn(
          "relative w-full border-b border-border/35 px-3 py-2 text-left transition-colors duration-150",
          "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]",
          needsReply && !selected && "border-l-2 border-l-primary/45"
        )}
        aria-current={selected ? "true" : undefined}
        title={review.author || "Anonym"}
      >
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm ring-2 ring-background",
              avatarClass,
              selected && "ring-primary/30"
            )}
          >
            {senderInitial}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "truncate text-[13px]",
                  needsReply ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                )}
              >
                <SearchHighlight text={review.author || "Anonym"} query={searchQuery} />
              </span>
              <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground" dateTime={review.createdAt} title={fullDate}>
                {formattedDate}
              </time>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Stars rating={review.rating} />
              {review.rating != null ? (
                <span className="text-[10px] tabular-nums text-muted-foreground">{review.rating}/5</span>
              ) : null}
            </div>
            <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground/90">
              <SearchHighlight text={snippet} query={searchQuery} />
            </p>
            <div className="mt-1">
              {needsReply ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Circle className="h-2 w-2 fill-primary text-primary" aria-hidden />
                  Behöver svar
                </span>
              ) : (
                <span className="text-[10px] text-emerald-600">Besvarad</span>
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
          className="absolute right-1.5 top-2 text-muted-foreground opacity-100 transition-colors hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label="Öppna recension externt"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
});
