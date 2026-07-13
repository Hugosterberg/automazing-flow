import { useEffect, useRef } from "react";
import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { OutreachInboxRow } from "./OutreachInboxRow";
import type { OutreachQueueItem } from "./outreachQueueTypes";

type RowMeta = {
  formattedDate: string;
  fullDate: string;
  senderInitial: string;
  avatarClass: string;
};

type Props = {
  items: OutreachQueueItem[];
  selectedId: string | null;
  emptyTitle: string;
  emptyDescription: string;
  getRowMeta: (item: OutreachQueueItem) => RowMeta;
  onSelect: (item: OutreachQueueItem) => void;
  searchQuery?: string;
};

export function OutreachInboxList({
  items,
  selectedId,
  emptyTitle,
  emptyDescription,
  getRowMeta,
  onSelect,
  searchQuery = "",
}: Props) {
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, items.length]);

  return (
    <div className="message-inbox-pane flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <p className="text-[11px] font-medium text-foreground/80">Outreach-kö</p>
        {items.length > 0 ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
            {items.length} utkast
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {items.length > 0 ? (
          <div>
            {items.map((item) => {
              const meta = getRowMeta(item);
              return (
                <OutreachInboxRow
                  key={item.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(item.id, el);
                    else rowRefs.current.delete(item.id);
                  }}
                  item={item}
                  selected={selectedId === item.id}
                  formattedDate={meta.formattedDate}
                  fullDate={meta.fullDate}
                  senderInitial={meta.senderInitial}
                  avatarClass={meta.avatarClass}
                  onSelect={() => onSelect(item)}
                  searchQuery={searchQuery}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6">
            <EmptyState icon={Mail} title={emptyTitle} description={emptyDescription} size="compact" />
          </div>
        )}
      </div>
    </div>
  );
}
