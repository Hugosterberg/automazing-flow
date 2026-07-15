import { memo, forwardRef } from "react";
import { CheckCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SearchHighlight } from "./SearchHighlight";
import type { UnifiedMessage } from "./types";

type Props = {
  message: UnifiedMessage;
  selected: boolean;
  open: boolean;
  visuallyUnread?: boolean;
  urgent: boolean;
  channelLabel: string;
  aiSummary?: string;
  waited: string | null;
  formattedDate: string;
  fullDate: string;
  senderInitial: string;
  avatarGradient: string;
  isHandled: boolean;
  searchQuery?: string;
  onSelect: () => void;
  onMarkHandled?: () => void;
  onPrefetch?: () => void;
};

export const MessageInboxRow = memo(
  forwardRef<HTMLButtonElement, Props>(function MessageInboxRow(
    {
      message,
      selected,
      open,
      visuallyUnread = open,
      urgent,
      channelLabel,
      waited,
      formattedDate,
      fullDate,
      senderInitial,
      avatarGradient,
      isHandled,
      searchQuery = "",
      onSelect,
      onMarkHandled,
      onPrefetch,
    },
    ref
  ) {
    const displayName = message.from.name || message.from.email || message.subject;
    const preview =
      message.kind === "email" && message.subject
        ? message.subject
        : message.snippet || message.subject || "";

    return (
      <div
        className={cn(
          "group relative",
          selected && "bg-primary/[0.08]",
          open && !selected && "bg-primary/[0.03]",
          isHandled && !selected && !open && "opacity-70"
        )}
      >
        <button
          ref={ref}
          type="button"
          onClick={onSelect}
          onDoubleClick={(e) => {
            if (open && onMarkHandled) {
              e.preventDefault();
              onMarkHandled();
            }
          }}
          onMouseEnter={onPrefetch}
          onFocus={onPrefetch}
          className={cn(
            "relative flex w-full items-center gap-1 border-b border-border/25 px-1 py-0.5 text-left transition-colors duration-100",
            "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60",
            selected && "border-l-2 border-l-primary pl-[calc(0.25rem-1px)]",
            open && !selected && "border-l border-l-primary/35"
          )}
          aria-current={selected ? "true" : undefined}
          title={`${displayName}${channelLabel ? ` · ${channelLabel}` : ""}${preview ? ` — ${preview}` : ""}${
            waited ? ` · ${waited}` : ""
          }`}
        >
          <span
            className={cn(
              "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[7px] font-semibold text-white",
              avatarGradient
            )}
            aria-hidden
          >
            {senderInitial}
            {visuallyUnread ? (
              <span
                className={cn(
                  "absolute -left-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-background",
                  urgent && "animate-pulse"
                )}
              />
            ) : null}
          </span>

          <span
            className={cn(
              "min-w-0 max-w-[38%] shrink-0 truncate text-[10px] leading-none",
              visuallyUnread ? "font-semibold text-foreground" : "font-medium text-foreground/85"
            )}
          >
            <SearchHighlight text={displayName} query={searchQuery} />
          </span>

          {message.isStarred ? (
            <Star className="h-2 w-2 shrink-0 fill-amber-400 text-amber-500" aria-label="Flaggad" />
          ) : null}

          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[10px] leading-none",
              open || selected ? "text-foreground/65" : "text-muted-foreground"
            )}
          >
            <SearchHighlight text={preview} query={searchQuery} />
          </span>

          <time
            className="shrink-0 pl-0.5 text-[9px] tabular-nums text-muted-foreground"
            dateTime={message.date}
            title={fullDate || undefined}
          >
            {formattedDate}
          </time>
        </button>

        {open && onMarkHandled && !isHandled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 p-0 text-muted-foreground opacity-100 hover:bg-emerald-500/10 hover:text-emerald-600 sm:opacity-0 sm:group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onMarkHandled();
            }}
            aria-label="Markera som hanterad"
            title="Markera som hanterad (H)"
          >
            <CheckCheck className="h-2.5 w-2.5" />
          </Button>
        ) : null}
      </div>
    );
  })
);

MessageInboxRow.displayName = "MessageInboxRow";
