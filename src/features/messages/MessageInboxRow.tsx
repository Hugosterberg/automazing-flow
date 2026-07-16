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

function buildPreview(message: UnifiedMessage): { primary: string; secondary: string } {
  const subject = message.subject?.trim() || "";
  const snippet = message.snippet?.trim() || "";
  if (message.kind === "email") {
    if (subject && snippet && snippet !== subject) {
      return { primary: subject, secondary: snippet };
    }
    return { primary: subject || snippet, secondary: "" };
  }
  return { primary: snippet || subject, secondary: "" };
}

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
    const { primary, secondary } = buildPreview(message);

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
            "relative flex w-full min-w-0 items-start gap-2 border-b border-border/25 px-2 py-2 text-left transition-colors duration-100",
            "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60",
            selected && "border-l-2 border-l-primary pl-[calc(0.5rem-1px)]",
            open && !selected && "border-l border-l-primary/35"
          )}
          aria-current={selected ? "true" : undefined}
          title={`${displayName}${channelLabel ? ` · ${channelLabel}` : ""}${primary ? ` — ${primary}` : ""}${
            waited ? ` · ${waited}` : ""
          }`}
        >
          <span
            className={cn(
              "relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-white",
              avatarGradient
            )}
            aria-hidden
          >
            {senderInitial}
            {visuallyUnread ? (
              <span
                className={cn(
                  "absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-1 ring-background",
                  urgent && "animate-pulse"
                )}
              />
            ) : null}
          </span>

          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex min-w-0 items-center gap-1">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs leading-tight",
                  visuallyUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                )}
              >
                <SearchHighlight text={displayName} query={searchQuery} />
              </span>
              {message.isStarred ? (
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-label="Flaggad" />
              ) : null}
              <time
                className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                dateTime={message.date}
                title={fullDate || undefined}
              >
                {formattedDate}
              </time>
            </span>

            {primary ? (
              <span
                className={cn(
                  "block min-w-0 text-[11px] leading-snug",
                  secondary ? "truncate" : "line-clamp-2",
                  open || selected ? "text-foreground/70" : "text-muted-foreground"
                )}
              >
                <SearchHighlight text={primary} query={searchQuery} />
              </span>
            ) : null}

            {secondary ? (
              <span className="block min-w-0 line-clamp-2 text-[10px] leading-snug text-muted-foreground/90">
                <SearchHighlight text={secondary} query={searchQuery} />
              </span>
            ) : null}
          </span>
        </button>

        {open && onMarkHandled && !isHandled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1.5 h-6 w-6 p-0 text-muted-foreground opacity-100 hover:bg-emerald-500/10 hover:text-emerald-600 sm:opacity-0 sm:group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onMarkHandled();
            }}
            aria-label="Markera som hanterad"
            title="Markera som hanterad (H)"
          >
            <CheckCheck className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
    );
  })
);

MessageInboxRow.displayName = "MessageInboxRow";
