import { useEffect, useRef } from "react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageInboxRow } from "./MessageInboxRow";
import type { UnifiedMessage } from "./types";

type RowMeta = {
  open: boolean;
  waited: string | null;
  channelLabel: string;
  aiSummary?: string;
  formattedDate: string;
  senderInitial: string;
  avatarClass: string;
  isHandled: boolean;
};

type Props = {
  messages: UnifiedMessage[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  unreadOnly: boolean;
  unansweredCount?: number;
  emptyTitle: string;
  emptyDescription: string;
  getRowMeta: (msg: UnifiedMessage) => RowMeta;
  onSelect: (msg: UnifiedMessage) => void;
  onMarkHandled: (id: string) => void;
};

export function MessageInboxList({
  messages,
  selectedId,
  loading,
  error,
  unreadOnly,
  unansweredCount = 0,
  emptyTitle,
  emptyDescription,
  getRowMeta,
  onSelect,
  onMarkHandled,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, messages.length]);

  return (
    <>
      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground/80">
            {loading
              ? "Loading inbox…"
              : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
            {unreadOnly ? " · filtered" : ""}
          </p>
          {!loading && unansweredCount > 0 ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
              {unansweredCount} open
            </span>
          ) : null}
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {loading ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-3">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-secondary" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 w-2/5 animate-pulse rounded bg-secondary" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/70" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length > 0 ? (
          <div className="divide-y divide-border/60">
            {messages.map((msg) => {
              const meta = getRowMeta(msg);
              return (
                <MessageInboxRow
                  key={msg.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(msg.id, el);
                    else rowRefs.current.delete(msg.id);
                  }}
                  message={msg}
                  selected={selectedId === msg.id}
                  open={meta.open}
                  channelLabel={meta.channelLabel}
                  aiSummary={meta.aiSummary}
                  waited={meta.waited}
                  formattedDate={meta.formattedDate}
                  senderInitial={meta.senderInitial}
                  avatarClass={meta.avatarClass}
                  isHandled={meta.isHandled}
                  onSelect={() => onSelect(msg)}
                  onMarkHandled={() => onMarkHandled(msg.id)}
                />
              );
            })}
          </div>
        ) : !error ? (
          <div className="p-6">
            <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : null}
      </div>
    </>
  );
}
