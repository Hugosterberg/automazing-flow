import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatFullDateTime, formatSmartDate } from "@/lib/format";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { AutomationEnableHint } from "@/features/automation";
import { senderInitial } from "@/features/messages";
import { useProfileDocument } from "@/features/profile-documents";
import { OutreachDetailPanel, OutreachDetailPlaceholder } from "./OutreachDetailPanel";
import { OutreachInboxList } from "./OutreachInboxList";
import { outreachDraftToMailto } from "./outreachClient";
import {
  OUTREACH_QUEUE_DOC_KEY,
  pendingOutreachItems,
  type OutreachQueueItem,
} from "./outreachQueueTypes";

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

const formatDate = formatSmartDate;
const formatFullDate = formatFullDateTime;

const detailMotion = {
  initial: { opacity: 0, x: 12, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -8, filter: "blur(2px)" },
  transition: { duration: 0.16, ease: [0.25, 0.1, 0.25, 1] as const },
};

type Props = {
  businessProfileId: string | null;
};

export function OutreachQueueWorkspace({ businessProfileId }: Props) {
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const doc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  const pending = useMemo(() => pendingOutreachItems(doc.data), [doc.data]);
  const [searchParams, setSearchParams] = useSearchParams();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 160);
  const urlItemId = searchParams.get("id");
  const [selectedId, setSelectedId] = useState<string | null>(urlItemId);
  const autoSelectedDesktop = useRef(false);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter(
      (item) =>
        item.leadName.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        (item.subject?.toLowerCase().includes(q) ?? false) ||
        (item.prospectEmail?.toLowerCase().includes(q) ?? false)
    );
  }, [pending, debouncedSearch]);

  const selectedItem = useMemo(
    () => (selectedId ? filtered.find((item) => item.id === selectedId) ?? pending.find((item) => item.id === selectedId) ?? null : null),
    [filtered, pending, selectedId]
  );

  const selectedIndex = useMemo(
    () => (selectedId ? filtered.findIndex((item) => item.id === selectedId) : -1),
    [filtered, selectedId]
  );

  const selectItem = useCallback(
    (item: OutreachQueueItem | null) => {
      setSelectedId(item?.id ?? null);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", "outreach-queue");
          if (item) next.set("id", item.id);
          else next.delete("id");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const navigateRelative = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const currentIndex = selectedId ? filtered.findIndex((item) => item.id === selectedId) : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : filtered.length - 1
          : Math.min(filtered.length - 1, Math.max(0, currentIndex + delta));
      selectItem(filtered[nextIndex] ?? null);
    },
    [filtered, selectedId, selectItem]
  );

  const markSent = useCallback(
    (id: string) => {
      doc.save(doc.data.map((item) => (item.id === id ? { ...item, status: "sent" as const } : item)));
      toast.success("Markerad som skickad");
    },
    [doc]
  );

  const removeItem = useCallback(
    (id: string) => {
      doc.save(doc.data.filter((item) => item.id !== id));
      toast.success("Utkast borttaget");
    },
    [doc]
  );

  const advanceAfterAction = useCallback(
    (fromId: string) => {
      const idx = filtered.findIndex((item) => item.id === fromId);
      const next = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      selectItem(next);
    },
    [filtered, selectItem]
  );

  const markSentAndAdvance = useCallback(
    (id: string) => {
      markSent(id);
      advanceAfterAction(id);
    },
    [advanceAfterAction, markSent]
  );

  const copyItem = useCallback(async (item: OutreachQueueItem) => {
    const text = [item.subject ? `Ämne: ${item.subject}` : "", item.body].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("Kopierat");
  }, []);

  useEffect(() => {
    if (urlItemId && pending.some((item) => item.id === urlItemId)) {
      setSelectedId(urlItemId);
    }
  }, [urlItemId, pending]);

  useEffect(() => {
    autoSelectedDesktop.current = false;
  }, [debouncedSearch]);

  useEffect(() => {
    if (selectedId && !pending.some((item) => item.id === selectedId)) {
      selectItem(null);
    }
  }, [pending, selectedId, selectItem]);

  useEffect(() => {
    if (selectedId || filtered.length === 0 || autoSelectedDesktop.current) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      selectItem(filtered[0] ?? null);
      autoSelectedDesktop.current = true;
    }
  }, [filtered, selectedId, selectItem]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateRelative(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateRelative(-1);
      } else if (e.key === "/" && !e.shiftKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (matchesKey(e, "s") && isPlainLetterShortcut(e) && selectedItem) {
        e.preventDefault();
        markSentAndAdvance(selectedItem.id);
      } else if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        selectItem(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [markSentAndAdvance, navigateRelative, selectItem, selectedId, selectedItem]);

  const getRowMeta = useCallback(
    (item: OutreachQueueItem) => ({
      formattedDate: formatDate(item.createdAt),
      fullDate: formatFullDate(item.createdAt),
      senderInitial: senderInitial(item.leadName),
      avatarClass: avatarColor(item.leadName || item.id),
    }),
    []
  );

  const navigation =
    filtered.length > 1 && selectedIndex >= 0
      ? {
          index: selectedIndex,
          total: filtered.length,
          hasPrev: selectedIndex > 0,
          hasNext: selectedIndex < filtered.length - 1,
          onPrev: () => navigateRelative(-1),
          onNext: () => navigateRelative(1),
        }
      : undefined;

  const detailProps = selectedItem
    ? {
        onCopy: () => void copyItem(selectedItem),
        onMarkSent: () => markSentAndAdvance(selectedItem.id),
        onRemove: () => {
          const id = selectedItem.id;
          removeItem(id);
          advanceAfterAction(id);
        },
        mailtoHref: selectedItem.prospectEmail
          ? outreachDraftToMailto(
              { subject: selectedItem.subject, body: selectedItem.body, linkedinMessage: "", followUps: [] },
              selectedItem.prospectEmail
            )
          : null,
        navigation,
      }
    : null;

  if (!businessProfileId) {
    return (
      <p className="text-sm text-muted-foreground px-4 py-6">Välj en affärsprofil för att se outreach-kön.</p>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <AutomationEnableHint
          tab="messages"
          focus="sales-outreach-auto"
          title="Outreach-kön är tom"
          description="Aktivera automatisk outreach — utkast hamnar här när uppföljningar ska göras. Du granskar och skickar själv."
          ctaLabel="Aktivera outreach-automation"
        />
      </div>
    );
  }

  function renderDetailPane(showBack?: boolean) {
    return (
      <AnimatePresence mode="wait">
        {selectedItem && detailProps ? (
          <m.div key={selectedItem.id} className="flex h-full min-h-0 flex-col" {...detailMotion}>
            <OutreachDetailPanel
              item={selectedItem}
              showBack={showBack}
              onBack={() => selectItem(null)}
              {...detailProps}
            />
          </m.div>
        ) : (
          <m.div key="placeholder" className="flex h-full min-h-0 flex-col" {...detailMotion}>
            <OutreachDetailPlaceholder />
          </m.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-[280px] flex-col sm:min-h-[400px] lg:min-h-[480px]",
        !isDesktopWorkspace && selectedItem && "workspace-reading-focus rounded-none border-0 shadow-none"
      )}
    >
      {isDesktopWorkspace || !selectedItem ? (
      <div className="app-workspace-toolbar flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <div className="relative min-w-[180px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök utkast…"
            className={cn(
              "border-border/60 bg-background/60 pl-8 text-sm shadow-sm",
              !isDesktopWorkspace ? "h-10" : "h-8 text-xs"
            )}
            aria-label="Sök outreach-utkast"
          />
        </div>
        <p className="ml-auto hidden text-[11px] tabular-nums text-muted-foreground md:block">
          {filtered.length} av {pending.length} utkast
          {debouncedSearch.trim() ? " · sök aktiv" : ""}
        </p>
      </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {!isDesktopWorkspace ? (
          <div className="flex h-full min-h-0">
            {!selectedItem ? (
              <aside className="flex h-full w-full min-h-0 flex-col">
                <OutreachInboxList
                  items={filtered}
                  selectedId={selectedId}
                  emptyTitle="Inga utkast matchar"
                  emptyDescription="Prova ett annat sökord eller rensa filtret."
                  getRowMeta={getRowMeta}
                  onSelect={selectItem}
                  searchQuery={debouncedSearch}
                />
              </aside>
            ) : (
              <section className="message-reading-pane flex h-full min-h-0 w-full flex-col overflow-hidden">
                {renderDetailPane(true)}
              </section>
            )}
          </div>
        ) : (
        <ResizablePanelGroup orientation="horizontal" className="flex h-full min-h-0">
          <ResizablePanel defaultSize="38" minSize="28" maxSize="48" className="min-h-0 min-w-[280px] border-r border-border/40">
            <aside className="flex h-full min-h-0 flex-col overflow-hidden">
              <OutreachInboxList
                items={filtered}
                selectedId={selectedId}
                emptyTitle="Inga utkast matchar"
                emptyDescription="Prova ett annat sökord eller rensa filtret."
                getRowMeta={getRowMeta}
                onSelect={selectItem}
                searchQuery={debouncedSearch}
              />
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle className="w-px bg-border/40 transition-colors hover:bg-primary/35" />
          <ResizablePanel defaultSize="62" minSize="40" className="min-h-0 min-w-0">
            <section className="message-reading-pane flex h-full min-h-0 flex-col overflow-hidden">
              {renderDetailPane()}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
        )}
      </div>

      {isDesktopWorkspace ? (
      <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4">
        <span className="truncate">
          {selectedItem ? (
            <>
              Valt: <span className="font-medium text-foreground/80">{selectedItem.leadName}</span>
              {filtered.length > 1 && selectedIndex >= 0 ? (
                <span className="ml-2 tabular-nums">({selectedIndex + 1}/{filtered.length})</span>
              ) : null}
            </>
          ) : (
            "Välj ett utkast i listan"
          )}
        </span>
        <span className="hidden sm:inline">J/K · S Sent · / Search</span>
      </div>
      ) : null}
    </div>
  );
}
