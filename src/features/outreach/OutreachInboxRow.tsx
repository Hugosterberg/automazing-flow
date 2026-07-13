import { forwardRef } from "react";
import { Mail } from "lucide-react";
import { SearchHighlight } from "@/features/messages/SearchHighlight";
import { cn } from "@/lib/utils";
import type { OutreachQueueItem } from "./outreachQueueTypes";

type Props = {
  item: OutreachQueueItem;
  selected: boolean;
  formattedDate: string;
  fullDate: string;
  senderInitial: string;
  avatarClass: string;
  onSelect: () => void;
  searchQuery?: string;
};

export const OutreachInboxRow = forwardRef<HTMLButtonElement, Props>(function OutreachInboxRow(
  { item, selected, formattedDate, fullDate, senderInitial, avatarClass, onSelect, searchQuery = "" },
  ref
) {
  const snippet = (item.body || "Inget utkast").slice(0, 120);

  return (
    <div className={cn("group relative", selected && "bg-primary/[0.07]")}>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className={cn(
          "relative w-full border-b border-border/35 px-3 py-2 text-left transition-colors duration-150",
          "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]"
        )}
        aria-current={selected ? "true" : undefined}
        title={item.leadName}
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
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate text-[13px] font-medium", selected ? "font-semibold text-foreground" : "text-foreground/90")}>
                <SearchHighlight text={item.leadName} query={searchQuery} />
              </span>
              <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground" dateTime={item.createdAt} title={fullDate}>
                {formattedDate}
              </time>
            </div>
            {item.subject ? (
              <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-foreground/80">
                <SearchHighlight text={item.subject} query={searchQuery} />
              </p>
            ) : null}
            <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground/90">
              <SearchHighlight text={snippet} query={searchQuery} />
            </p>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-primary">
              <Mail className="h-2.5 w-2.5" aria-hidden />
              {item.prospectEmail ? (
                <SearchHighlight text={item.prospectEmail} query={searchQuery} />
              ) : (
                "Ingen e-post"
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
});
