import { forwardRef } from "react";
import { BadgeCheck, Circle, ExternalLink, ImageIcon, Star } from "lucide-react";
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
          className={cn("h-3.5 w-3.5 sm:h-3 sm:w-3", i < rating ? "fill-current" : "fill-none opacity-30")}
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
  const snippet = (review.text || "Ingen text").slice(0, 140);
  const pictureCount = review.pictures?.length ?? 0;

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
          "relative w-full border-b border-border/35 px-3 py-3 text-left transition-colors duration-150 sm:py-2.5",
          "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]",
          needsReply && !selected && "border-l-2 border-l-primary/45"
        )}
        aria-current={selected ? "true" : undefined}
        title={review.author || "Anonym"}
      >
        <div className="flex items-start gap-2.5 sm:gap-2">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ring-2 ring-background sm:h-9 sm:w-9 sm:text-xs",
              avatarClass,
              selected && "ring-primary/30"
            )}
          >
            {senderInitial}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "truncate text-[15px] leading-snug sm:text-sm",
                  needsReply ? "font-semibold text-foreground" : "font-medium text-foreground/85"
                )}
              >
                <SearchHighlight text={review.author || "Anonym"} query={searchQuery} />
              </span>
              <time className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-[11px]" dateTime={review.createdAt} title={fullDate}>
                {formattedDate}
              </time>
            </div>
            <div className="mt-1 flex items-center gap-1.5 sm:mt-0.5">
              <Stars rating={review.rating} />
              {review.rating != null ? (
                <span className="text-xs tabular-nums text-muted-foreground sm:text-[11px]">{review.rating}/5</span>
              ) : null}
              {review.verified ? (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 text-emerald-600 sm:h-3 sm:w-3"
                  aria-label="Verifierat köp"
                />
              ) : null}
              {pictureCount > 0 ? (
                <span
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground sm:text-[11px]"
                  aria-label={`${pictureCount} kundbild${pictureCount === 1 ? "" : "er"}`}
                >
                  <ImageIcon className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden />
                  {pictureCount}
                </span>
              ) : null}
            </div>
            {/* Judge.me reviews carry a headline — it scans far better than the
                body's first line, so it leads when present. */}
            {review.title ? (
              <p className="mt-1 truncate text-sm font-medium leading-snug text-foreground/90 sm:mt-0.5 sm:text-xs">
                <SearchHighlight text={review.title} query={searchQuery} />
              </p>
            ) : null}
            <p
              className={cn(
                "line-clamp-2 text-sm leading-snug text-muted-foreground sm:line-clamp-1 sm:text-xs",
                review.title ? "mt-0.5" : "mt-1 sm:mt-0.5"
              )}
            >
              <SearchHighlight text={snippet} query={searchQuery} />
            </p>
            <div className="mt-1.5 sm:mt-1">
              {needsReply ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary sm:gap-1 sm:text-[11px]">
                  <Circle className="h-2.5 w-2.5 fill-primary text-primary sm:h-2 sm:w-2" aria-hidden />
                  Behöver svar
                </span>
              ) : (
                <span className="text-xs text-emerald-600 sm:text-[11px]">Besvarad</span>
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
          className="absolute right-1.5 top-3 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:top-2 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label="Öppna recension externt"
        >
          <ExternalLink className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </a>
      ) : null}
    </div>
  );
});
