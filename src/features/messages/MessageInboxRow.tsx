import { memo, forwardRef } from "react";
import { m } from "framer-motion";
import { CheckCheck, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SearchHighlight } from "./SearchHighlight";
import { channelIconFor } from "./messagesUi";
import type { UnifiedMessage } from "./types";

type Props = {
  message: UnifiedMessage;
  selected: boolean;
  open: boolean;
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
      urgent,
      channelLabel,
      aiSummary,
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
    const ChannelIcon = channelIconFor(message);
    const displayName = message.from.name || message.from.email || message.subject;

    return (
      <m.div
        layout="position"
        initial={false}
        animate={{ opacity: 1 }}
        className={cn(
          "group relative",
          selected && "bg-primary/[0.07]",
          open && !selected && "bg-primary/[0.03]",
          isHandled && !selected && !open && "opacity-80"
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
            "relative w-full border-b border-border/35 px-3 py-3 text-left transition-colors duration-150 sm:py-2.5",
            "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
            selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)] shadow-[inset_0_1px_0_hsl(var(--primary)/0.06)]",
            open && !selected && "border-l-2 border-l-primary/45"
          )}
          aria-current={selected ? "true" : undefined}
          title={`${displayName}${channelLabel ? ` · ${channelLabel}` : ""}`}
        >
          <div className="flex items-start gap-2">
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm ring-2 ring-background transition-transform duration-150 group-hover:scale-[1.03] sm:h-9 sm:w-9 sm:text-xs",
                  avatarGradient,
                  selected && "ring-primary/30"
                )}
              >
                {senderInitial}
              </div>
              {ChannelIcon ? (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-card text-foreground shadow-sm">
                  <ChannelIcon className="h-2.5 w-2.5" />
                </span>
              ) : null}
              {open ? (
                <span
                  className={cn(
                    "absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary",
                    urgent && "animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                  )}
                  aria-hidden
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1 pr-6">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-[15px] leading-snug sm:text-sm",
                    open ? "font-semibold text-foreground" : isHandled ? "font-normal text-muted-foreground" : "font-medium text-foreground/85"
                  )}
                >
                  <SearchHighlight text={displayName} query={searchQuery} />
                </span>
                <time
                  className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-[11px]"
                  dateTime={message.date}
                  title={fullDate || undefined}
                >
                  {formattedDate}
                </time>
              </div>

              {message.kind === "email" && message.subject ? (
                <p className={cn("mt-0.5 truncate text-sm sm:text-xs", open || selected ? "font-medium text-foreground/90" : "text-muted-foreground")}>
                  <SearchHighlight text={message.subject} query={searchQuery} />
                </p>
              ) : null}

              <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground sm:mt-0.5 sm:line-clamp-1 sm:text-xs">
                <SearchHighlight text={message.snippet} query={searchQuery} />
              </p>

              {(urgent || waited || (selected && aiSummary)) ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-1 sm:gap-1">
                  {waited ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium sm:gap-0.5 sm:px-1.5 sm:text-[10px]",
                        urgent ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                      )}
                    >
                      <Clock className="h-3 w-3 sm:h-2.5 sm:w-2.5" aria-hidden />
                      {waited}
                    </span>
                  ) : null}
                  {selected && aiSummary ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-400 sm:gap-0.5 sm:px-1.5 sm:text-[10px]">
                      <Sparkles className="h-2.5 w-2.5 sm:h-2 sm:w-2" aria-hidden />
                      AI
                    </span>
                  ) : null}
                  {isHandled ? <span className="text-[11px] text-muted-foreground sm:text-[10px]">Hanterad</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        </button>

        {open && onMarkHandled && !isHandled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1.5 top-1/2 h-10 w-10 -translate-y-1/2 p-0 text-muted-foreground opacity-100 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 sm:right-1 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onMarkHandled();
            }}
            aria-label="Markera som hanterad"
            title="Markera som hanterad (E) — dubbelklicka raden"
          >
            <CheckCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        ) : null}
      </m.div>
    );
  })
);

MessageInboxRow.displayName = "MessageInboxRow";
