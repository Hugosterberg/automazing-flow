import { AnimatePresence, m } from "framer-motion";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { MessageDetailPanel, MessageDetailPlaceholder, type MessageDetailPanelProps } from "./MessageDetailPanel";
import { MessageInboxList } from "./MessageInboxList";
import type { InboxFilter, UnifiedMessage } from "./types";

type RowMeta = {
  open: boolean;
  visuallyUnread?: boolean;
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
  filteredMessages: UnifiedMessage[];
  selectedMessage: UnifiedMessage | null;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  inboxFilter: InboxFilter;
  searchQuery?: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  getRowMeta: (msg: UnifiedMessage) => RowMeta;
  onSelect: (msg: UnifiedMessage | null) => void;
  onMarkHandled: (id: string) => void;
  onPrefetch?: (msg: UnifiedMessage) => void;
  detailProps: Omit<MessageDetailPanelProps, "message"> | null;
};

const detailMotion = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
  transition: { duration: 0.14, ease: [0.25, 0.1, 0.25, 1] as const },
};

function DetailPane({
  selectedMessage,
  detailProps,
  showBack,
}: {
  selectedMessage: UnifiedMessage | null;
  detailProps: Omit<MessageDetailPanelProps, "message"> | null;
  showBack?: boolean;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {selectedMessage && detailProps ? (
        <m.div key={selectedMessage.id} className="flex h-full min-h-0 flex-col" {...detailMotion}>
          <MessageDetailPanel message={selectedMessage} {...detailProps} showBack={showBack} />
        </m.div>
      ) : (
        <m.div key="placeholder" className="flex h-full min-h-0 flex-col" {...detailMotion}>
          <MessageDetailPlaceholder />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function InboxPane(
  props: Omit<Props, "detailProps" | "selectedMessage"> & { className?: string }
) {
  const {
    filteredMessages,
    selectedId,
    loading,
    error,
    inboxFilter,
    searchQuery,
    emptyTitle,
    emptyDescription,
    emptyAction,
    getRowMeta,
    onSelect,
    onMarkHandled,
    onPrefetch,
    className,
  } = props;

  return (
    <aside className={className}>
      <MessageInboxList
        messages={filteredMessages}
        selectedId={selectedId}
        loading={loading}
        error={error}
        inboxFilter={inboxFilter}
        searchQuery={searchQuery}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={emptyAction}
        getRowMeta={getRowMeta}
        onSelect={onSelect}
        onMarkHandled={onMarkHandled}
        onPrefetch={onPrefetch}
      />
    </aside>
  );
}

/**
 * Mount exactly one layout tree.
 * Do NOT dual-render mobile + desktop with Tailwind `hidden` — react-resizable-panels
 * sets inline `display:flex` which overrides `hidden` and stacked both views on phones.
 */
export function MessageWorkspace({
  filteredMessages,
  selectedMessage,
  selectedId,
  loading,
  error,
  inboxFilter,
  searchQuery,
  emptyTitle,
  emptyDescription,
  emptyAction,
  getRowMeta,
  onSelect,
  onMarkHandled,
  onPrefetch,
  detailProps,
}: Props) {
  const isDesktopWorkspace = useIsDesktopWorkspace();

  // Phone/tablet: list OR detail — never both, never a sibling desktop tree.
  if (!isDesktopWorkspace) {
    if (!selectedMessage) {
      return (
        <div className="flex h-full min-h-0 w-full">
          <InboxPane
            className="flex h-full w-full min-h-0 flex-col"
            filteredMessages={filteredMessages}
            selectedId={selectedId}
            loading={loading}
            error={error}
            inboxFilter={inboxFilter}
            searchQuery={searchQuery}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyAction={emptyAction}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
            onMarkHandled={onMarkHandled}
            onPrefetch={onPrefetch}
          />
        </div>
      );
    }

    return (
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
        <DetailPane selectedMessage={selectedMessage} detailProps={detailProps} showBack />
      </section>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel defaultSize="20" minSize="14" maxSize="28" className="min-h-0 min-w-[160px] border-r border-border/40 shadow-[inset_-1px_0_0_hsl(var(--border)/0.35)]">
        <InboxPane
          className="flex h-full min-h-0 flex-col overflow-hidden"
          filteredMessages={filteredMessages}
          selectedId={selectedId}
          loading={loading}
          error={error}
          inboxFilter={inboxFilter}
          searchQuery={searchQuery}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyAction={emptyAction}
          getRowMeta={getRowMeta}
          onSelect={onSelect}
          onMarkHandled={onMarkHandled}
          onPrefetch={onPrefetch}
        />
      </ResizablePanel>
      <ResizableHandle withHandle className="w-px bg-border/40 transition-colors hover:bg-primary/35 data-[resize-handle-active]:bg-primary/50" />
      <ResizablePanel defaultSize="80" minSize="55" className="min-h-0 min-w-0">
        <section className="message-reading-pane flex h-full min-h-0 flex-col overflow-hidden bg-background">
          <DetailPane selectedMessage={selectedMessage} detailProps={detailProps} />
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
