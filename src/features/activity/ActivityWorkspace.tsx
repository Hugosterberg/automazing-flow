import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { ActivityDetailPanel, ActivityDetailPlaceholder } from "./ActivityDetailPanel";
import { ActivityFeed } from "./ActivityFeed";
import type { ActivityEventRow } from "./useActivityFeed";

type Props = {
  events: ActivityEventRow[];
  selectedEvent: ActivityEventRow | null;
  selectedId: string | null;
  isLoading: boolean;
  emptyMessage: string;
  onSelect: (event: ActivityEventRow | null) => void;
  searchQuery?: string;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
};

export function ActivityWorkspace({
  events,
  selectedEvent,
  selectedId,
  isLoading,
  emptyMessage,
  onSelect,
  searchQuery = "",
  navigation,
}: Props) {
  const isDesktopWorkspace = useIsDesktopWorkspace();

  if (!isDesktopWorkspace) {
    return (
      <div className="flex h-full min-h-0">
        {!selectedEvent ? (
          <aside className="message-inbox-pane flex h-full w-full min-h-0 flex-col">
            <ActivityFeed
              events={events}
              isLoading={isLoading}
              emptyMessage={emptyMessage}
              selectedId={selectedId}
              onSelect={onSelect}
              variant="list"
              searchQuery={searchQuery}
            />
          </aside>
        ) : (
          <section className="message-reading-pane flex h-full min-h-0 w-full flex-col overflow-hidden">
            <ActivityDetailPanel event={selectedEvent} onBack={() => onSelect(null)} showBack navigation={navigation} />
          </section>
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="flex h-full min-h-0">
        <ResizablePanel defaultSize="38" minSize="28" maxSize="48" className="min-h-0 min-w-[280px] border-r border-border/40">
          <aside className="message-inbox-pane flex h-full min-h-0 flex-col overflow-hidden">
            <ActivityFeed
              events={events}
              isLoading={isLoading}
              emptyMessage={emptyMessage}
              selectedId={selectedId}
              onSelect={onSelect}
              variant="list"
              searchQuery={searchQuery}
            />
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle className="w-px bg-border/40 transition-colors hover:bg-primary/35" />
        <ResizablePanel defaultSize="62" minSize="40" className="min-h-0 min-w-0">
          <section className="message-reading-pane flex h-full min-h-0 flex-col overflow-hidden">
            {selectedEvent ? (
              <ActivityDetailPanel event={selectedEvent} navigation={navigation} />
            ) : (
              <ActivityDetailPlaceholder />
            )}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
  );
}
