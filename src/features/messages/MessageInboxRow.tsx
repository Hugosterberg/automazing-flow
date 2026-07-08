import { forwardRef } from "react";
import { CheckCheck, Circle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UnifiedMessage } from "./types";

type Props = {
  message: UnifiedMessage;
  selected: boolean;
  open: boolean;
  channelLabel: string;
  aiSummary?: string;
  waited: string | null;
  formattedDate: string;
  senderInitial: string;
  avatarClass: string;
  isHandled: boolean;
  onSelect: () => void;
  onMarkHandled?: () => void;
};

export const MessageInboxRow = forwardRef<HTMLButtonElement, Props>(function MessageInboxRow(
  {
    message,
    selected,
    open,
    channelLabel,
    aiSummary,
    waited,
    formattedDate,
    senderInitial,
    avatarClass,
    isHandled,
    onSelect,
    onMarkHandled,
  },
  ref
) {
  return (
    <div
      className={cn(
        "group relative border-b border-border/60 last:border-b-0",
        selected && "bg-primary/5",
        open && !selected && "bg-primary/[0.03]"
      )}
    >
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full px-3 py-3 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected && "border-l-[3px] border-l-primary pl-[calc(0.75rem-2px)]",
          open && !selected && "border-l-2 border-l-primary/50"
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
          <div className="min-w-0 flex-1 pr-8">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={cn("truncate text-sm", open ? "font-semibold" : "font-medium text-muted-foreground")}>
                {message.from.name || message.from.email || message.subject}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formattedDate}</span>
            </div>
            <p className={cn("truncate text-sm", open ? "font-medium" : "text-muted-foreground")}>
              {message.subject}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{message.snippet}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                {channelLabel}
              </Badge>
              {waited ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  {waited}
                </span>
              ) : null}
              {open ? <Circle className="h-2 w-2 fill-primary text-primary" aria-label="Needs attention" /> : null}
              {isHandled ? (
                <span className="text-[10px] text-muted-foreground">Handled</span>
              ) : null}
            </div>
            {aiSummary ? (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/70">{aiSummary}</p>
            ) : null}
          </div>
        </div>
      </button>
      {open && onMarkHandled && !isHandled ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 p-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onMarkHandled();
          }}
          aria-label="Mark as handled"
          title="Mark as handled"
        >
          <CheckCheck className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
});
