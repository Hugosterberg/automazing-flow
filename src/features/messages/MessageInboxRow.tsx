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
          selected && "bg-primary/[0.06]",
          open && !selected && "bg-primary/[0.02]"
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
            "relative w-full border-b border-border/40 px-3 py-2.5 text-left transition-all duration-150",
            "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            selected && "border-l-[3px] border-l-primary bg-primary/[0.06] pl-[calc(0.75rem-2px)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]",
            open && !selected && "border-l-2 border-l-primary/40"
          )}
          aria-current={selected ? "true" : undefined}
        >
          <div className="flex items-start gap-2.5">
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm ring-2 ring-background transition-transform duration-150 group-hover:scale-[1.03]",
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

            <div className="min-w-0 flex-1 pr-7">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    open ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                  )}
                >
                  <SearchHighlight text={displayName} query={searchQuery} />
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{formattedDate}</span>
              </div>

              {message.kind === "email" && message.subject ? (
                <p className={cn("truncate text-xs", open ? "font-medium text-foreground/90" : "text-muted-foreground")}>
                  <SearchHighlight text={message.subject} query={searchQuery} />
                </p>
              ) : null}

              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/90">
                <SearchHighlight text={message.snippet} query={searchQuery} />
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {channelLabel}
                </span>
                {waited ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-medium",
                      urgent ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                    )}
                  >
                    <Clock className="h-2.5 w-2.5" aria-hidden />
                    {waited}
                  </span>
                ) : null}
                {aiSummary ? (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">
                    <Sparkles className="h-2 w-2" aria-hidden />
                    AI
                  </span>
                ) : null}
                {isHandled ? <span className="text-[9px] text-muted-foreground">Hanterad</span> : null}
              </div>

              {aiSummary && selected ? (
                <p className="mt-1.5 flex items-start gap-1 line-clamp-2 rounded-md border border-violet-500/15 bg-violet-500/5 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
                  <Sparkles className="mt-0.5 h-2.5 w-2.5 shrink-0 text-violet-400" aria-hidden />
                  {aiSummary}
                </p>
              ) : null}
            </div>
          </div>
        </button>

        {open && onMarkHandled && !isHandled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onMarkHandled();
            }}
            aria-label="Markera som hanterad"
            title="Markera som hanterad (E) — dubbelklicka raden"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </m.div>
    );
  })
);

MessageInboxRow.displayName = "MessageInboxRow";
