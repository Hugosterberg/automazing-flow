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
  const initial = lead.company.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={cn("group relative", selected && "bg-primary/[0.07]", overdue && !selected && "bg-destructive/[0.03]")}>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className={cn(
          "relative w-full border-b border-border/35 px-3 py-3 text-left transition-colors duration-150 sm:py-2.5",
          "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]",
          overdue && !selected && "border-l-2 border-l-destructive/50"
        )}
        aria-current={selected ? "true" : undefined}
        title={lead.company}
      >
        <div className="flex items-start gap-2.5 sm:gap-2">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-sm font-semibold text-foreground/75 ring-2 ring-background sm:h-9 sm:w-9 sm:text-xs",
              selected && "bg-primary/15 text-primary ring-primary/25"
            )}
          >
            <span className="sm:hidden">{initial}</span>
            <Building2 className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "truncate text-[15px] leading-snug sm:text-sm",
                  selected ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                )}
              >
                <SearchHighlight text={lead.company} query={searchQuery} />
              </span>
              <time
                className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-[11px]"
                dateTime={lead.nextFollowUpAt ?? undefined}
                title={fullDate}
              >
                {formattedDate}
              </time>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground sm:mt-0.5 sm:line-clamp-1 sm:text-xs">
              <SearchHighlight text={contactLine} query={searchQuery} />
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-1">
              <Badge variant="outline" className="h-5 px-1.5 text-[11px] sm:h-4 sm:text-[9px]">
                {LEAD_STATUS_LABELS[lead.status]}
              </Badge>
              {overdue ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive sm:gap-0.5 sm:text-[11px]">
                  <AlertTriangle className="h-3 w-3 sm:h-2.5 sm:w-2.5" aria-hidden />
                  Försenad
                </span>
              ) : dueToday ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warning sm:gap-0.5 sm:text-[11px]">
                  <CalendarClock className="h-3 w-3 sm:h-2.5 sm:w-2.5" aria-hidden />
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
