import { AnimatePresence, m } from "framer-motion";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ReviewDetailPanel, ReviewDetailPlaceholder, type ReviewDetailPanelProps } from "./ReviewDetailPanel";
import { ReviewInboxList } from "./ReviewInboxList";
import type { ReviewItem } from "./types";

type RowMeta = {
  needsReply: boolean;
  formattedDate: string;
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
  getRowMeta: (review: ReviewItem) => RowMeta;
  onSelect: (review: ReviewItem | null) => void;
  detailProps: Omit<ReviewDetailPanelProps, "review"> | null;
};

const detailMotion = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
  transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] as const },
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
    getRowMeta,
    onSelect,
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
        getRowMeta={getRowMeta}
        onSelect={onSelect}
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
  getRowMeta,
  onSelect,
  detailProps,
}: Props) {
  return (
    <>
      <div className="flex h-full min-h-0 lg:hidden">
        {!selectedReview ? (
          <InboxPane
            className="flex h-full w-full min-h-0 flex-col"
            filteredReviews={filteredReviews}
            selectedId={selectedId}
            loading={loading}
            needsReplyCount={needsReplyCount}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
          />
        ) : (
          <section className="flex h-full min-h-0 w-full flex-col bg-background">
            <DetailPane selectedReview={selectedReview} detailProps={detailProps} showBack />
          </section>
        )}
      </div>

      <ResizablePanelGroup orientation="horizontal" className="hidden h-full min-h-0 lg:flex">
        <ResizablePanel defaultSize={36} minSize={26} maxSize={48} className="min-h-0">
          <InboxPane
            className="flex h-full min-h-0 flex-col"
            filteredReviews={filteredReviews}
            selectedId={selectedId}
            loading={loading}
            needsReplyCount={needsReplyCount}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            getRowMeta={getRowMeta}
            onSelect={onSelect}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={64} minSize={42} className="min-h-0">
          <section className="flex h-full min-h-0 flex-col bg-background">
            <DetailPane selectedReview={selectedReview} detailProps={detailProps} />
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
