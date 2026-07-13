import { useEffect, useMemo, useRef } from "react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageInboxRow } from "./MessageInboxRow";
import type { InboxFilter, UnifiedMessage } from "./types";

type RowMeta = {
  open: boolean;
  waited: string | null;
  urgent: boolean;
  channelLabel: string;
  aiSummary?: string;
  formattedDate: string;
  fullDate: string;
  senderInitial: string;
  avatarGradient: string;
  isHandled: boolean;
};

type Props = {
  messages: UnifiedMessage[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  inboxFilter: InboxFilter;
  searchQuery?: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  getRowMeta: (msg: UnifiedMessage) => RowMeta;
  onSelect: (msg: UnifiedMessage) => void;
  onMarkHandled: (id: string) => void;
  onPrefetch?: (msg: UnifiedMessage) => void;
};

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/40 bg-muted/40 px-3 py-1.5 backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
      {count !== undefined ? (
        <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function InboxListHeader({ count, loading }: { count: number; loading: boolean }) {
  if (loading || count === 0) return null;
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
      <p className="text-[11px] font-medium text-foreground/80">Inkorg</p>
      <span className="text-[10px] tabular-nums text-muted-foreground">{count} st</span>
    </div>
  );
}

export function MessageInboxList({
  messages,
  selectedId,
  loading,
  error,
  inboxFilter,
  searchQuery = "",
  emptyTitle,
  emptyDescription,
  emptyAction,
  getRowMeta,
  onSelect,
  onMarkHandled,
  onPrefetch,
}: Props) {
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const { openMessages, restMessages } = useMemo(() => {
    const open: UnifiedMessage[] = [];
    const rest: UnifiedMessage[] = [];
    for (const msg of messages) {
      if (getRowMeta(msg).open) open.push(msg);
      else rest.push(msg);
    }
    return { openMessages: open, restMessages: rest };
  }, [messages, getRowMeta]);

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, messages.length]);

  function renderRow(msg: UnifiedMessage) {
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
        urgent={meta.urgent}
        channelLabel={meta.channelLabel}
        aiSummary={meta.aiSummary}
        waited={meta.waited}
        formattedDate={meta.formattedDate}
        fullDate={meta.fullDate}
        senderInitial={meta.senderInitial}
        avatarGradient={meta.avatarGradient}
        isHandled={meta.isHandled}
        searchQuery={searchQuery}
        onSelect={() => onSelect(msg)}
        onMarkHandled={() => onMarkHandled(msg.id)}
        onPrefetch={onPrefetch ? () => onPrefetch(msg) : undefined}
      />
    );
  }

  const showSections = inboxFilter === "queue";

  return (
    <div className="message-inbox-pane flex h-full min-h-0 flex-col">
      <InboxListHeader count={messages.length} loading={loading} />
      <div className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {loading ? (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2.5 shimmer">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted/60" />
                <div className="flex-1 space-y-1.5 py-0.5">
                  <div className="flex justify-between gap-2">
                    <div className="h-2.5 w-2/5 rounded bg-muted/60" />
                    <div className="h-2.5 w-8 rounded bg-muted/40" />
                  </div>
                  <div className="h-2.5 w-3/4 rounded bg-muted/50" />
                  <div className="h-2 w-full rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length > 0 ? (
          <div>
            {showSections && openMessages.length > 0 ? (
              <>
                <SectionLabel count={openMessages.length}>Behöver svar</SectionLabel>
                {openMessages.map(renderRow)}
              </>
            ) : null}
            {showSections && restMessages.length > 0 ? (
              <>
                {openMessages.length > 0 ? (
                  <SectionLabel count={restMessages.length}>Övriga</SectionLabel>
                ) : null}
                {restMessages.map(renderRow)}
              </>
            ) : null}
            {!showSections ? messages.map(renderRow) : null}
          </div>
        ) : !error ? (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6">
            <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} action={emptyAction} size="compact" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
