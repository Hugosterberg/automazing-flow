import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { dateInputToEndOfDayIso } from "@/lib/localDate";
import { LeadResearchDialog, type LeadResearchTarget } from "@/features/intelligence";
import type { OutreachDraftTarget } from "@/features/outreach";
import { LeadEditDialog } from "./LeadEditDialog";
import { LeadFollowUpDetailPanel, LeadFollowUpDetailPlaceholder } from "./LeadFollowUpDetailPanel";
import { LeadFollowUpInboxList } from "./LeadFollowUpInboxList";
import {
  compareLeads,
  isFollowUpDueToday,
  isFollowUpOverdue,
  isLeadOpen,
  suggestedFollowUpIsoForStatus,
  type LeadStatus,
} from "./leadHelpers";
import type { Lead } from "./leadsService";
import { useLeads } from "./useLeads";

const detailMotion = {
  initial: { opacity: 0, x: 12, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -8, filter: "blur(2px)" },
  transition: { duration: 0.16, ease: [0.25, 0.1, 0.25, 1] as const },
};

function compareDueLeads(a: Lead, b: Lead): number {
  const overdueA = isFollowUpOverdue(a.nextFollowUpAt);
  const overdueB = isFollowUpOverdue(b.nextFollowUpAt);
  if (overdueA !== overdueB) return overdueA ? -1 : 1;
  return compareLeads(a, b);
}

type Props = {
  businessProfileId: string | null;
  onDraftOutreach?: (target: OutreachDraftTarget, leadId: string) => void;
  onAddToPipeline?: (lead: Lead) => void;
};

export function LeadFollowUpsWorkspace({ businessProfileId, onDraftOutreach, onAddToPipeline }: Props) {
  const { leads, updateLead, isLoading } = useLeads(businessProfileId);
  const [searchParams, setSearchParams] = useSearchParams();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 160);
  const autoSelectedDesktop = useRef(false);

  const urlLeadId = searchParams.get("lead");
  const [selectedId, setSelectedId] = useState<string | null>(urlLeadId);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [researchTarget, setResearchTarget] = useState<LeadResearchTarget | null>(null);

  const dueLeads = useMemo(() => {
    return leads
      .filter(
        (l) =>
          isLeadOpen(l.status) &&
          (isFollowUpOverdue(l.nextFollowUpAt) || isFollowUpDueToday(l.nextFollowUpAt))
      )
      .sort(compareDueLeads);
  }, [leads]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return dueLeads;
    return dueLeads.filter((l) =>
      [l.company, l.contactName, l.email, l.phone, l.notes].some((v) => v?.toLowerCase().includes(q))
    );
  }, [dueLeads, debouncedSearch]);

  const selectedLead = useMemo(
    () => (selectedId ? filtered.find((l) => l.id === selectedId) ?? dueLeads.find((l) => l.id === selectedId) ?? null : null),
    [filtered, dueLeads, selectedId]
  );

  const selectedIndex = useMemo(
    () => (selectedId ? filtered.findIndex((l) => l.id === selectedId) : -1),
    [filtered, selectedId]
  );

  const selectLead = useCallback(
    (lead: Lead | null) => {
      setSelectedId(lead?.id ?? null);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", "followups");
          if (lead) next.set("lead", lead.id);
          else next.delete("lead");
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
      const currentIndex = selectedId ? filtered.findIndex((l) => l.id === selectedId) : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : filtered.length - 1
          : Math.min(filtered.length - 1, Math.max(0, currentIndex + delta));
      selectLead(filtered[nextIndex] ?? null);
    },
    [filtered, selectedId, selectLead]
  );

  const advanceAfterAction = useCallback(
    (fromId: string) => {
      const idx = filtered.findIndex((l) => l.id === fromId);
      const next = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      selectLead(next);
    },
    [filtered, selectLead]
  );

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    const patch: Parameters<typeof updateLead>[0]["patch"] = { status };
    if (isLeadOpen(status) && !lead.nextFollowUpAt) {
      const suggested = suggestedFollowUpIsoForStatus(status);
      if (suggested) patch.nextFollowUpAt = suggested;
    }
    try {
      await updateLead({ id: lead.id, patch });
      const nextFollowUp = patch.nextFollowUpAt ?? lead.nextFollowUpAt;
      if (
        !isLeadOpen(status) ||
        (!isFollowUpOverdue(nextFollowUp) && !isFollowUpDueToday(nextFollowUp))
      ) {
        advanceAfterAction(lead.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte uppdatera lead.");
    }
  }

  useEffect(() => {
    if (urlLeadId && dueLeads.some((l) => l.id === urlLeadId)) {
      setSelectedId(urlLeadId);
    }
  }, [urlLeadId, dueLeads]);

  useEffect(() => {
    autoSelectedDesktop.current = false;
  }, [debouncedSearch]);

  useEffect(() => {
    if (selectedId && !dueLeads.some((l) => l.id === selectedId)) {
      selectLead(null);
    }
  }, [dueLeads, selectedId, selectLead]);

  useEffect(() => {
    if (selectedId || filtered.length === 0 || autoSelectedDesktop.current) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      selectLead(filtered[0] ?? null);
      autoSelectedDesktop.current = true;
    }
  }, [filtered, selectedId, selectLead]);

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
      } else if (matchesKey(e, "o") && isPlainLetterShortcut(e) && selectedLead && onDraftOutreach) {
        e.preventDefault();
        onDraftOutreach(
          {
            prospectCompany: selectedLead.company,
            prospectContact: selectedLead.contactName ?? undefined,
            prospectEmail: selectedLead.email ?? undefined,
            prospectWebsite: selectedLead.website ?? undefined,
            prospectNotes: selectedLead.notes ?? undefined,
          },
          selectedLead.id
        );
      } else if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        selectLead(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateRelative, onDraftOutreach, selectLead, selectedId, selectedLead]);

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

  if (!businessProfileId) {
    return <p className="text-sm text-muted-foreground px-4 py-6">Välj en affärsprofil för att se uppföljningar.</p>;
  }

  if (!isLoading && dueLeads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">Inga uppföljningar just nu</p>
        <p className="mt-1 text-xs text-muted-foreground">Alla leads är ikapp — bra jobbat.</p>
      </div>
    );
  }

  function renderDetailPane(showBack?: boolean) {
    return (
      <AnimatePresence mode="wait">
        {selectedLead ? (
          <m.div key={selectedLead.id} className="flex h-full min-h-0 flex-col" {...detailMotion}>
            <LeadFollowUpDetailPanel
              lead={selectedLead}
              showBack={showBack}
              onBack={() => selectLead(null)}
              navigation={navigation}
              onStatusChange={(status) => void handleStatusChange(selectedLead, status)}
              onFollowUpChange={async (value) => {
                try {
                  await updateLead({
                    id: selectedLead.id,
                    patch: { nextFollowUpAt: value ? dateInputToEndOfDayIso(value) : null },
                  });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Kunde inte uppdatera datum.");
                }
              }}
              onDraftOutreach={
                onDraftOutreach
                  ? () =>
                      onDraftOutreach(
                        {
                          prospectCompany: selectedLead.company,
                          prospectContact: selectedLead.contactName ?? undefined,
                          prospectEmail: selectedLead.email ?? undefined,
                          prospectWebsite: selectedLead.website ?? undefined,
                          prospectNotes: selectedLead.notes ?? undefined,
                        },
                        selectedLead.id
                      )
                  : undefined
              }
              onResearch={() =>
                setResearchTarget({
                  company: selectedLead.company,
                  name: selectedLead.contactName ?? undefined,
                  website: selectedLead.website ?? undefined,
                })
              }
              onAddToPipeline={onAddToPipeline ? () => onAddToPipeline(selectedLead) : undefined}
              onEdit={() => {
                setEditLead(selectedLead);
                setEditOpen(true);
              }}
            />
          </m.div>
        ) : (
          <m.div key="placeholder" className="flex h-full min-h-0 flex-col" {...detailMotion}>
            <LeadFollowUpDetailPlaceholder />
          </m.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-[280px] flex-col sm:min-h-[400px] lg:min-h-[480px]">
        <div className="app-workspace-toolbar flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              id="sales-followups-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök leads…"
              className="h-8 border-border/60 bg-background/60 pl-8 text-xs shadow-sm"
              aria-label="Sök uppföljningar"
            />
          </div>
          <p className="ml-auto hidden text-[11px] tabular-nums text-muted-foreground md:block">
            {isLoading ? "Laddar…" : `${filtered.length} av ${dueLeads.length} att följa upp`}
            {debouncedSearch.trim() ? " · sök aktiv" : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 lg:hidden">
            {!selectedLead ? (
              <aside className="flex h-full w-full min-h-0 flex-col">
                <LeadFollowUpInboxList
                  leads={filtered}
                  selectedId={selectedId}
                  emptyTitle="Inga leads matchar"
                  emptyDescription="Prova ett annat sökord eller rensa filtret."
                  onSelect={selectLead}
                  searchQuery={debouncedSearch}
                />
              </aside>
            ) : (
              <section className="message-reading-pane flex h-full min-h-0 w-full flex-col">
                {renderDetailPane(true)}
              </section>
            )}
          </div>

          <ResizablePanelGroup orientation="horizontal" className="hidden h-full min-h-0 lg:flex">
            <ResizablePanel defaultSize={38} minSize={28} maxSize={48} className="min-h-0 min-w-[280px] border-r border-border/40">
              <aside className="flex h-full min-h-0 flex-col overflow-hidden">
                <LeadFollowUpInboxList
                  leads={filtered}
                  selectedId={selectedId}
                  emptyTitle="Inga leads matchar"
                  emptyDescription="Prova ett annat sökord eller rensa filtret."
                  onSelect={selectLead}
                  searchQuery={debouncedSearch}
                />
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle className="w-px bg-border/40 transition-colors hover:bg-primary/35" />
            <ResizablePanel defaultSize={62} minSize={40} className="min-h-0 min-w-0">
              <section className="message-reading-pane flex h-full min-h-0 flex-col overflow-hidden">
                {renderDetailPane()}
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4">
          <span className="truncate">
            {selectedLead ? (
              <>
                Vald: <span className="font-medium text-foreground/80">{selectedLead.company}</span>
                {filtered.length > 1 && selectedIndex >= 0 ? (
                  <span className="ml-2 tabular-nums">({selectedIndex + 1}/{filtered.length})</span>
                ) : null}
              </>
            ) : (
              "Välj en lead i listan"
            )}
          </span>
          <span className="hidden sm:inline">J/K · O Outreach · / Search</span>
        </div>
      </div>

      <LeadEditDialog
        lead={editLead}
        open={editOpen}
        businessProfileId={businessProfileId}
        onOpenChange={setEditOpen}
        onSave={async (id, patch) => {
          await updateLead({ id, patch });
          toast.success("Lead uppdaterad.");
        }}
      />

      <LeadResearchDialog
        businessProfileId={businessProfileId}
        target={researchTarget}
        onOpenChange={(open) => {
          if (!open) setResearchTarget(null);
        }}
      />
    </>
  );
}
