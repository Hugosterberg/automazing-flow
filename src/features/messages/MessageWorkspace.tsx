import { AnimatePresence, m } from "framer-motion";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { MessageDetailPanel, MessageDetailPlaceholder, type MessageDetailPanelProps } from "./MessageDetailPanel";
import { MessageInboxList } from "./MessageInboxList";
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
  filteredMessages: UnifiedMessage[];
  selectedMessage: UnifiedMessage | null;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  unreadOnly: boolean;
  emptyTitle: string;
  emptyDescription: string;
  unansweredCount: number;
  getRowMeta: (msg: UnifiedMessage) => RowMeta;
  onSelect: (msg: UnifiedMessage | null) => void;
  onMarkHandled: (id: string) => void;
  detailProps: Omit<MessageDetailPanelProps, "message"> | null;
};

const detailMotion = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
  transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] as const },
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
    <AnimatePresence mode="wait">
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

function InboxPane(props: Omit<Props, "detailProps" | "selectedMessage"> & { className?: string }) {
  const {
    filteredMessages,
    selectedId,
    loading,
    error,
    unreadOnly,
    emptyTitle,
    emptyDescription,
    unansweredCount,
    getRowMeta,
    onSelect,
    onMarkHandled,
    className,
  } = props;

  return (
    <aside className={className}>
      <MessageInboxList
        messages={filteredMessages}
        selectedId={selectedId}
        loading={loading}
        error={error}
        unreadOnly={unreadOnly}
        unansweredCount={unansweredCount}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        getRowMeta={getRowMeta}
        onSelect={onSelect}
        onMarkHandled={onMarkHandled}
      />
    </aside>
  );
}

export function MessageWorkspace({
  filteredMessages,
  selectedMessage,
  selectedId,
  loading,
  error,
  unreadOnly,
  emptyTitle,
  emptyDescription,
  unansweredCount,
  getRowMeta,
  onSelect,
  onMarkHandled,
  detailProps,
}: Props) {
  return (
    <>
      <div className="flex h-full min-h-0 lg:hidden">
        {!selectedMessage ? (
          <InboxPane
            className="flex h-full w-full min-h-0 flex-col"
            filteredMessages={filteredMessages}
            selectedId={selectedId}
            loading={loading}
            error={error}
            unreadOnly={unreadOnly}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            unansweredCount={unansweredCount}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
            onMarkHandled={onMarkHandled}
          />
        ) : (
          <section className="flex h-full min-h-0 w-full flex-col bg-background">
            <DetailPane
              selectedMessage={selectedMessage}
              detailProps={detailProps}
              showBack
            />
          </section>
        )}
      </div>

      <ResizablePanelGroup orientation="horizontal" className="hidden h-full min-h-0 lg:flex">
        <ResizablePanel defaultSize={36} minSize={26} maxSize={48} className="min-h-0 min-w-0">
          <InboxPane
            className="flex h-full min-h-0 flex-col overflow-hidden"
            filteredMessages={filteredMessages}
            selectedId={selectedId}
            loading={loading}
            error={error}
            unreadOnly={unreadOnly}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            unansweredCount={unansweredCount}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
            onMarkHandled={onMarkHandled}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-border/60" />
        <ResizablePanel defaultSize={64} minSize={42} className="min-h-0 min-w-0">
          <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            <DetailPane selectedMessage={selectedMessage} detailProps={detailProps} />
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
