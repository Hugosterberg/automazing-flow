import { AnimatePresence, m } from "framer-motion";
import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { ReviewDetailPanel, ReviewDetailPlaceholder, type ReviewDetailPanelProps } from "./ReviewDetailPanel";
import { ReviewInboxList } from "./ReviewInboxList";
import type { ReviewItem } from "./types";

type RowMeta = {
  needsReply: boolean;
  formattedDate: string;
  fullDate: string;
  senderInitial: string;
  avatarClass: string;
};

type Props = {
  filteredReviews: ReviewItem[];
  selectedReview: ReviewItem | null;
  selectedId: string | null;
  loading: boolean;
  needsReplyCount: number;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  emptySecondaryAction?: ReactNode;
  getRowMeta: (review: ReviewItem) => RowMeta;
  onSelect: (review: ReviewItem | null) => void;
  detailProps: Omit<ReviewDetailPanelProps, "review"> | null;
  searchQuery?: string;
};

const detailMotion = {
  initial: { opacity: 0, x: 12, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -8, filter: "blur(2px)" },
  transition: { duration: 0.16, ease: [0.25, 0.1, 0.25, 1] as const },
};

function DetailPane({
  selectedReview,
  detailProps,
  showBack,
}: {
  selectedReview: ReviewItem | null;
  detailProps: Omit<ReviewDetailPanelProps, "review"> | null;
  showBack?: boolean;
}) {
  return (
    <AnimatePresence mode="wait">
      {selectedReview && detailProps ? (
        <m.div key={selectedReview.id} className="flex h-full min-h-0 flex-col" {...detailMotion}>
          <ReviewDetailPanel review={selectedReview} {...detailProps} showBack={showBack} />
        </m.div>
      ) : (
        <m.div key="placeholder" className="flex h-full min-h-0 flex-col" {...detailMotion}>
          <ReviewDetailPlaceholder />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function InboxPane(
  props: Omit<Props, "detailProps" | "selectedReview"> & { className?: string }
) {
  const {
    filteredReviews,
    selectedId,
    loading,
    needsReplyCount,
    emptyTitle,
    emptyDescription,
    emptyAction,
    emptySecondaryAction,
    getRowMeta,
    onSelect,
    searchQuery = "",
    className,
  } = props;

  return (
    <aside className={className}>
      <ReviewInboxList
        reviews={filteredReviews}
        selectedId={selectedId}
        loading={loading}
        needsReplyCount={needsReplyCount}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={emptyAction}
        emptySecondaryAction={emptySecondaryAction}
        getRowMeta={getRowMeta}
        onSelect={onSelect}
        searchQuery={searchQuery}
      />
    </aside>
  );
}

export function ReviewWorkspace({
  filteredReviews,
  selectedReview,
  selectedId,
  loading,
  needsReplyCount,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptySecondaryAction,
  getRowMeta,
  onSelect,
  detailProps,
  searchQuery = "",
}: Props) {
  const isDesktopWorkspace = useIsDesktopWorkspace();

  if (!isDesktopWorkspace) {
    return (
      <div className="flex h-full min-h-0">
        {!selectedReview ? (
          <InboxPane
            className="flex h-full w-full min-h-0 flex-col"
            filteredReviews={filteredReviews}
            selectedId={selectedId}
            loading={loading}
            needsReplyCount={needsReplyCount}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyAction={emptyAction}
            emptySecondaryAction={emptySecondaryAction}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
            searchQuery={searchQuery}
          />
        ) : (
          <section className="message-reading-pane flex h-full min-h-0 w-full flex-col overflow-hidden">
            <DetailPane selectedReview={selectedReview} detailProps={detailProps} showBack />
          </section>
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="flex h-full min-h-0">
        <ResizablePanel defaultSize="38" minSize="28" maxSize="48" className="min-h-0 min-w-[280px] border-r border-border/40">
          <InboxPane
            className="flex h-full min-h-0 flex-col overflow-hidden"
            filteredReviews={filteredReviews}
            selectedId={selectedId}
            loading={loading}
            needsReplyCount={needsReplyCount}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyAction={emptyAction}
            emptySecondaryAction={emptySecondaryAction}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
            searchQuery={searchQuery}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="w-px bg-border/40 transition-colors hover:bg-primary/35" />
        <ResizablePanel defaultSize="62" minSize="40" className="min-h-0 min-w-0">
          <section className="message-reading-pane flex h-full min-h-0 flex-col overflow-hidden">
            <DetailPane selectedReview={selectedReview} detailProps={detailProps} />
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
  );
}
