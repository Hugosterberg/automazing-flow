import { useState } from "react";
import { CheckCheck, Loader2, MoreHorizontal, RefreshCw, Search, Sparkles, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MESSAGE_TABS } from "./messagesUi";
import type { InboxFilter } from "./types";
import type { MessageChannelTab } from "./types";

type TabCounts = Record<MessageChannelTab, { total: number; unread: number }>;

const FILTER_OPTIONS: Array<{ value: InboxFilter; label: string; shortcut: string }> = [
  { value: "queue", label: "Kö", shortcut: "Q" },
  { value: "open", label: "Öppna", shortcut: "O" },
  { value: "all", label: "Alla", shortcut: "A" },
  { value: "handled", label: "Hanterade", shortcut: "H" },
];

type MessageInboxToolbarProps = {
  activeTab: MessageChannelTab;
  onTabChange: (tab: MessageChannelTab) => void;
  tabCounts: TabCounts;
  inboxSearch: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  inboxFilter: InboxFilter;
  onInboxFilterChange: (filter: InboxFilter) => void;
  unansweredCount: number;
  totalVisible: number;
  loading: boolean;
  onRefresh: () => void;
  onMarkAllHandled: () => void;
  markAllDisabled: boolean;
  onToggleAiSearch: () => void;
  aiSearchOpen: boolean;
  openTotal: number;
  isSearching?: boolean;
};

export function MessageInboxToolbar({
  activeTab,
  onTabChange,
  tabCounts,
  inboxSearch,
  onSearchChange,
  onSearchSubmit,
  searchInputRef,
  inboxFilter,
  onInboxFilterChange,
  unansweredCount,
  totalVisible,
  loading,
  onRefresh,
  onMarkAllHandled,
  markAllDisabled,
  onToggleAiSearch,
  aiSearchOpen,
  openTotal,
  isSearching,
}: MessageInboxToolbarProps) {
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const isMobile = useIsMobile();

  const primaryFilters = FILTER_OPTIONS.filter((opt) => opt.value === "queue" || opt.value === "open");
  const secondaryFilters = FILTER_OPTIONS.filter((opt) => opt.value === "all" || opt.value === "handled");

  return (
    <div className="shrink-0 border-b border-border/80 bg-card/60 backdrop-blur-md">
      <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4", isMobile && "py-3")}>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-border/60 bg-background/50 p-0.5",
            isMobile && "gap-1.5 p-1"
          )}
          role="tablist"
          aria-label="Kanaler"
        >
          {MESSAGE_TABS.map((tab) => {
            const counts = tabCounts[tab.value] || { total: 0, unread: 0 };
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-all duration-150",
                  isMobile ? "min-h-10 px-3 py-2 text-sm" : "px-2.5 py-1.5 text-xs",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {counts.unread > 0 ? (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                      active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"
                    )}
                  >
                    {counts.unread > 9 ? "9+" : counts.unread}
                  </span>
                ) : counts.total > 0 ? (
                  <span className="text-[10px] tabular-nums opacity-60">{counts.total}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isMobile ? (
            <Button
              type="button"
              variant={aiSearchOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={onToggleAiSearch}
              title="AI-mailsökning via MCP"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden md:inline">AI-sök</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(isMobile ? "h-10 w-10" : "h-8 w-8 p-0")}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Uppdatera inkorg"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className={cn("flex flex-col gap-2.5 border-t border-border/50 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-4", isSearching && "pb-4")}>
        <div className="relative w-full min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder={isMobile ? "Sök i inkorgen…" : "Sök inkorg…  /"}
            value={inboxSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchSubmit?.();
              }
              if (e.key === "Escape" && inboxSearch) {
                e.preventDefault();
                onSearchChange("");
                searchInputRef.current?.blur();
              }
            }}
            className={cn(
              "border-border/60 bg-background/60 pl-9 pr-9 text-sm shadow-sm transition-shadow focus-visible:border-primary/40 focus-visible:ring-primary/25",
              isMobile ? "h-10" : "h-8 text-xs"
            )}
          />
          {inboxSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label="Rensa sökning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {isSearching ? (
            <p className="absolute -bottom-4 left-0 text-[10px] tabular-nums text-muted-foreground">
              {totalVisible} träff{totalVisible === 1 ? "" : "ar"}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {isMobile ? (
            <>
              <div
                className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 rounded-lg border border-border/60 bg-background/40 p-1"
                role="group"
                aria-label="Filtrera inkorg"
              >
                {primaryFilters.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onInboxFilterChange(opt.value)}
                    className={cn(
                      "min-h-10 rounded-md px-3 text-sm font-medium transition-colors",
                      inboxFilter === opt.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    {opt.label}
                    {opt.value === "open" && unansweredCount > 0 ? (
                      <span className="ml-1 tabular-nums opacity-90">({unansweredCount})</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-10 w-10 shrink-0 p-0" aria-label="Fler filter">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {secondaryFilters.map((opt) => (
                    <DropdownMenuItem key={opt.value} onSelect={() => onInboxFilterChange(opt.value)}>
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={markAllDisabled} onSelect={() => setMarkAllOpen(true)}>
                    Markera alla som hanterade
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <div
                className="flex min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-border/60 bg-background/40 p-0.5 app-scroll"
                role="group"
                aria-label="Filtrera inkorg"
              >
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onInboxFilterChange(opt.value)}
                    title={`Genväg: ${opt.shortcut}`}
                    className={cn(
                      "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      inboxFilter === opt.value
                        ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    {opt.label}
                    {opt.value === "open" && unansweredCount > 0 ? (
                      <span className="ml-1 tabular-nums opacity-80">({unansweredCount})</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <AlertDialog open={markAllOpen} onOpenChange={setMarkAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs sm:px-3"
                    disabled={markAllDisabled}
                    aria-label="Markera alla som hanterade"
                  >
                    <CheckCheck className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Hantera alla</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Markera alla som hanterade?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {unansweredCount} obesvarade meddelanden i denna kanal markeras som hanterade. Du kan återöppna
                      enskilda meddelanden i detaljvyn.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        onMarkAllHandled();
                        setMarkAllOpen(false);
                      }}
                    >
                      Markera {unansweredCount}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>

        {isMobile ? (
          <AlertDialog open={markAllOpen} onOpenChange={setMarkAllOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Markera alla som hanterade?</AlertDialogTitle>
                <AlertDialogDescription>
                  {unansweredCount} obesvarade meddelanden i denna kanal markeras som hanterade.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onMarkAllHandled();
                    setMarkAllOpen(false);
                  }}
                >
                  Markera {unansweredCount}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        {!isMobile ? (
        <p className="text-[10px] tabular-nums text-muted-foreground sm:hidden">
          {loading ? "Laddar…" : `${totalVisible} · ${openTotal} öppna`}
        </p>
        ) : null}

        {!isMobile ? (
        <p className="ml-auto hidden text-[11px] tabular-nums text-muted-foreground md:block">
          {loading ? "Laddar…" : isSearching ? `${totalVisible} träffar · ${openTotal} öppna` : `${totalVisible} visade · ${openTotal} öppna`}
        </p>
        ) : (
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Laddar inkorg…"
            : isSearching
              ? `${totalVisible} träff${totalVisible === 1 ? "" : "ar"}`
              : `${openTotal} öppna · tryck ett meddelande för att läsa`}
        </p>
        )}
      </div>
    </div>
  );
}
