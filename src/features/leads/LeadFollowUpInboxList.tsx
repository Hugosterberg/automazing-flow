import { useEffect, useRef } from "react";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateCustom, formatShortDate } from "@/lib/format";
import { LeadFollowUpInboxRow } from "./LeadFollowUpInboxRow";
import type { Lead } from "./leadsService";

type Props = {
  leads: Lead[];
  selectedId: string | null;
  emptyTitle: string;
  emptyDescription: string;
  onSelect: (lead: Lead) => void;
  searchQuery?: string;
};

function formatFollowUpDate(iso: string | null): { short: string; full: string } {
  if (!iso) return { short: "—", full: "" };
  return {
    short: formatShortDate(iso) || iso.slice(0, 10),
    full:
      formatDateCustom(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) ||
      iso,
  };
}

export function LeadFollowUpInboxList({
  leads,
  selectedId,
  emptyTitle,
  emptyDescription,
  onSelect,
  searchQuery = "",
}: Props) {
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, leads.length]);

  return (
    <div className="message-inbox-pane flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <p className="text-[11px] font-medium text-foreground/80">Uppföljningar</p>
        {leads.length > 0 ? (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-warning">
            {leads.length} att göra
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {leads.length > 0 ? (
          <div>
            {leads.map((lead) => {
              const dates = formatFollowUpDate(lead.nextFollowUpAt);
              return (
                <LeadFollowUpInboxRow
                  key={lead.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(lead.id, el);
                    else rowRefs.current.delete(lead.id);
                  }}
                  lead={lead}
                  selected={selectedId === lead.id}
                  formattedDate={dates.short}
                  fullDate={dates.full}
                  onSelect={() => onSelect(lead)}
                  searchQuery={searchQuery}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6">
            <EmptyState icon={CalendarClock} title={emptyTitle} description={emptyDescription} size="compact" />
          </div>
        )}
      </div>
    </div>
  );
}
