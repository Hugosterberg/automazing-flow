import { forwardRef } from "react";
import { AlertTriangle, Building2, CalendarClock } from "lucide-react";
import { SearchHighlight } from "@/features/messages/SearchHighlight";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_LABELS, isFollowUpDueToday, isFollowUpOverdue } from "./leadHelpers";
import type { Lead } from "./leadsService";

type Props = {
  lead: Lead;
  selected: boolean;
  formattedDate: string;
  fullDate: string;
  onSelect: () => void;
  searchQuery?: string;
};

export const LeadFollowUpInboxRow = forwardRef<HTMLButtonElement, Props>(function LeadFollowUpInboxRow(
  { lead, selected, formattedDate, fullDate, onSelect, searchQuery = "" },
  ref
) {
  const overdue = isFollowUpOverdue(lead.nextFollowUpAt);
  const dueToday = isFollowUpDueToday(lead.nextFollowUpAt);
  const contactLine =
    [lead.contactName, lead.email, lead.phone].filter(Boolean).join(" · ") || "Inga kontaktuppgifter";

  return (
    <div className={cn("group relative", selected && "bg-primary/[0.07]", overdue && !selected && "bg-destructive/[0.03]")}>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className={cn(
          "relative w-full border-b border-border/35 px-3 py-2 text-left transition-colors duration-150",
          "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]",
          overdue && !selected && "border-l-2 border-l-destructive/50"
        )}
        aria-current={selected ? "true" : undefined}
        title={lead.company}
      >
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 ring-2 ring-background",
              selected && "ring-primary/30"
            )}
          >
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate text-[13px] font-medium", selected ? "font-semibold text-foreground" : "text-foreground/90")}>
                <SearchHighlight text={lead.company} query={searchQuery} />
              </span>
              <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground" dateTime={lead.nextFollowUpAt ?? undefined} title={fullDate}>
                {formattedDate}
              </time>
            </div>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/90">
              <SearchHighlight text={contactLine} query={searchQuery} />
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                {LEAD_STATUS_LABELS[lead.status]}
              </Badge>
              {overdue ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive">
                  <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                  Försenad
                </span>
              ) : dueToday ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-warning">
                  <CalendarClock className="h-2.5 w-2.5" aria-hidden />
                  Idag
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
});
