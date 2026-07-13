import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { m } from "framer-motion";
import { Activity as ActivityIcon, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFocusedWorkspaceReading, useIsMobile, useStackedWorkspace } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useVisibleIntervalRefetch } from "@/hooks/useVisibleIntervalRefetch";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { ActivityWorkspace, useActivityFeed } from "@/features/activity";
import type { ActivityEventRow } from "@/features/activity";

type SeverityFilter = "all" | ActivityEventRow["severity"];

export default function ActivityPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  const { events, isLoading, isFetching, refetch } = useActivityFeed(
    businessProfileId,
    { limit: 200 }
  );

  useVisibleIntervalRefetch(() => void refetch(), 60_000, { enabled: Boolean(businessProfileId) });

  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const debouncedActivitySearch = useDebouncedValue(activitySearch, 160);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const selectedId = searchParams.get("id");

  const selectEvent = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("id", id);
          else next.delete("id");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const severity = searchParams.get("severity");
    if (severity === "error" || severity === "warning" || severity === "success" || severity === "info") {
      setSeverityFilter(severity);
    }
  }, [searchParams]);

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.module);
    return Array.from(set).sort();
  }, [events]);

  const filteredByMeta = useMemo(() => {
    return events.filter((e) => {
      if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
      if (severityFilter !== "all" && e.severity !== severityFilter) return false;
      return true;
    });
  }, [events, moduleFilter, severityFilter]);

  const visible = useMemo(() => {
    const q = debouncedActivitySearch.trim().toLowerCase();
    if (!q) return filteredByMeta;
    return filteredByMeta.filter(
      (e) =>
        e.summary.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q) ||
        (e.event_type?.toLowerCase().includes(q) ?? false)
    );
  }, [filteredByMeta, debouncedActivitySearch]);

  const selectedEvent = useMemo(
    () => visible.find((e) => e.id === selectedId) ?? null,
    [visible, selectedId]
  );

  const severityCounts = useMemo(() => {
    const counts = { error: 0, warning: 0, success: 0, info: 0 };
    for (const e of filteredByMeta) counts[e.severity] += 1;
    return counts;
  }, [filteredByMeta]);

  const selectedIndex = useMemo(
    () => (selectedId ? visible.findIndex((e) => e.id === selectedId) : -1),
    [visible, selectedId]
  );

  const navigateRelative = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const currentIndex = selectedId ? visible.findIndex((e) => e.id === selectedId) : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : visible.length - 1
          : Math.min(visible.length - 1, Math.max(0, currentIndex + delta));
      selectEvent(visible[nextIndex]?.id ?? null);
    },
    [visible, selectedId, selectEvent]
  );

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
      } else if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        selectEvent(null);
      } else if (matchesKey(e, "e") && isPlainLetterShortcut(e) && severityCounts.error > 0) {
        e.preventDefault();
        setSeverityFilter("error");
      } else if (matchesKey(e, "w") && isPlainLetterShortcut(e) && severityCounts.warning > 0) {
        e.preventDefault();
        setSeverityFilter("warning");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateRelative, selectEvent, selectedId, severityCounts.error, severityCounts.warning]);

  const activityLiveHint =
    severityCounts.error > 0
      ? `${severityCounts.error} fel i loggen — börja där`
      : severityCounts.warning > 0
        ? `${severityCounts.warning} varningar att granska`
        : null;

  const isMobile = useIsMobile();
  const isStackedWorkspace = useStackedWorkspace();
  const focusedReading = useFocusedWorkspaceReading(Boolean(selectedEvent));

  if (!businessProfileId) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ActivityIcon className="h-7 w-7 text-muted-foreground" />
          Aktivitet
        </h1>
        <p className="text-sm text-muted-foreground">Välj en affärsprofil för att se aktivitetsflödet.</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-7xl", focusedReading ? "space-y-0" : "space-y-6")}>
      {!focusedReading ? (
        <>
          <PageHeader
            icon={ActivityIcon}
            title="Aktivitet"
            description={
              isMobile
                ? "Tryck en händelse i listan för att läsa detaljer."
                : "Granskningslogg för alla ändringar i denna affärsprofil."
            }
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="text-muted-foreground"
              >
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Uppdatera</span>
              </Button>
            }
          />

          <PageSmartBar
            title={
              isMobile
                ? "Filtrera och tryck en händelse för att se vad som hände."
                : "Aktivitet är din granskningslogg — allt som händer i profilen, filtrerbart och sökbart."
            }
            steps={
              isMobile
                ? ["Filtrera på modul eller allvarlighetsgrad", "Tryck en rad för detaljer", "Använd loggen när något ser fel ut"]
                : [
                    "Filtrera på modul eller allvarlighetsgrad för att hitta rätt händelse",
                    "Välj en rad i listan för att läsa detaljer och metadata",
                    "Använd loggen när något ser fel ut eller du behöver spåra vem som gjorde vad",
                  ]
            }
            tip={
              isMobile
                ? "Här syns vad automationer och synk gjorde — använd filtrer när något ser konstigt ut."
                : "Genvägar: J/K bläddra · / Search · E Error · W Warning · Esc Close."
            }
            liveHintOverride={activityLiveHint}
          />
        </>
      ) : null}

      <m.div
        {...pageFadeUp}
        transition={{ duration: 0.3 }}
        className={cn(
          "app-workspace-shell",
          focusedReading && "workspace-reading-focus rounded-none border-0 shadow-none"
        )}
      >
        {!focusedReading ? (
        <div className="app-workspace-toolbar flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <div className="relative w-full min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Sök händelser…"
              className={cn(
                "border-border/60 bg-background/60 pl-8 text-sm shadow-sm",
                isMobile ? "h-10" : "h-8 text-xs"
              )}
              aria-label="Sök aktivitet"
            />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className={cn("w-full border-border/60 bg-background/60 text-sm shadow-sm sm:w-[180px]", isMobile ? "h-10" : "h-8 text-xs")}>
              <SelectValue placeholder="Modul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla moduler</SelectItem>
              {moduleOptions.map((mod) => (
                <SelectItem key={mod} value={mod}>
                  {mod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}>
            <SelectTrigger className={cn("w-full border-border/60 bg-background/60 text-sm shadow-sm sm:w-[160px]", isMobile ? "h-10" : "h-8 text-xs")}>
              <SelectValue placeholder="Allvarlighet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla nivåer</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Lyckades</SelectItem>
              <SelectItem value="warning">Varning</SelectItem>
              <SelectItem value="error">Fel</SelectItem>
            </SelectContent>
          </Select>

          <p className="ml-auto hidden text-[11px] tabular-nums text-muted-foreground md:block">
            {isLoading ? "Laddar…" : `${visible.length} av ${events.length} händelser`}
            {debouncedActivitySearch.trim() ? " · sök aktiv" : ""}
          </p>
        </div>
        ) : null}

        {!focusedReading ? (
        <div className="app-workspace-stats flex flex-wrap gap-2 px-3 py-2 sm:px-4">
          {(
            [
              { key: "error", label: "Fel", count: severityCounts.error, className: "border-destructive/30 bg-destructive/5 text-destructive" },
              { key: "warning", label: "Varningar", count: severityCounts.warning, className: "border-warning/30 bg-warning/5 text-warning" },
              { key: "success", label: "Lyckades", count: severityCounts.success, className: "border-success/30 bg-success/5 text-success" },
            ] as const
          ).map((stat) => (
            <div
              key={stat.key}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left",
                stat.count > 0 ? stat.className : "border-border/50 bg-background/40 text-muted-foreground"
              )}
            >
              <div>
                <p className="text-[9px] uppercase tracking-wide opacity-80">{stat.label}</p>
                <p className="text-xs font-semibold tabular-nums">{stat.count}</p>
              </div>
            </div>
          ))}
        </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <ActivityWorkspace
            events={visible}
            selectedEvent={selectedEvent}
            selectedId={selectedId}
            isLoading={isLoading}
            emptyMessage={
              moduleFilter !== "all" || severityFilter !== "all" || debouncedActivitySearch.trim()
                ? "Inga händelser matchar filtren."
                : "Ingen aktivitet registrerad ännu. Skapa en uppgift eller koppla en integration för att komma igång."
            }
            onSelect={(event) => selectEvent(event?.id ?? null)}
            searchQuery={debouncedActivitySearch}
            navigation={
              visible.length > 1 && selectedIndex >= 0
                ? {
                    index: selectedIndex,
                    total: visible.length,
                    hasPrev: selectedIndex > 0,
                    hasNext: selectedIndex < visible.length - 1,
                    onPrev: () => navigateRelative(-1),
                    onNext: () => navigateRelative(1),
                  }
                : undefined
            }
          />
        </div>

        {!isStackedWorkspace ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4">
          <span className="truncate">
            {selectedEvent ? (
              <>
                Vald: <span className="font-medium text-foreground/80">{selectedEvent.summary}</span>
                {visible.length > 1 && selectedIndex >= 0 ? (
                  <span className="ml-2 tabular-nums text-muted-foreground">
                    ({selectedIndex + 1}/{visible.length})
                  </span>
                ) : null}
              </>
            ) : (
              "Välj en händelse i listan"
            )}
          </span>
          <span className="hidden sm:inline">J/K bläddra · / sök</span>
        </div>
        ) : null}
      </m.div>
    </div>
  );
}
