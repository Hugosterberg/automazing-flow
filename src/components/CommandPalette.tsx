import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Briefcase,
  Building2,
  Clock,
  Keyboard,
  ListPlus,
  LogOut,
  Megaphone,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  User,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  NAV_GROUP_LABELS,
  navItemsForMode,
  topNavItemsForMode,
  type NavGroup,
} from "@/components/navConfig";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceMode } from "@/features/workspace-mode";
import {
  getRecentPages,
  modKeyLabel,
  navTitleSv,
  NAV_GROUP_LABELS_SV,
  type RecentPage,
} from "@/lib/keyboardShortcuts";

type CommandPaletteProps = {
  onOpenShortcuts?: () => void;
};

/**
 * Global command palette: ⌘K / Ctrl+K opens a fuzzy-searchable list of pages,
 * recent visits, and quick actions. Swedish labels; pairs with G-chord nav
 * and the ? shortcuts dialog via Layout.
 */
export function CommandPalette({ onOpenShortcuts }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const navigate = useNavigate();
  const prefetchFor = useRoutePrefetch();
  const { authMode, signOut } = useAuth();
  const { mode, setMode } = useWorkspaceMode();
  const modKey = modKeyLabel();

  const { pageGroups, systemItems } = useMemo(() => {
    const modeNavItems = navItemsForMode(mode);
    return {
      pageGroups: (["work", "productivity"] as NavGroup[]).map((group) => ({
        label: NAV_GROUP_LABELS_SV[group] ?? NAV_GROUP_LABELS[group],
        items: modeNavItems.filter((item) => item.group === group),
      })),
      systemItems: topNavItemsForMode(mode),
    };
  }, [mode]);

  const refreshRecent = useCallback(() => {
    setRecentPages(getRecentPages());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (!value) refreshRecent();
          return !value;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshRecent]);

  function goTo(url: string) {
    setOpen(false);
    navigate(url);
  }

  function switchWorkspace() {
    setOpen(false);
    setMode(mode === "private" ? "business" : "private");
    navigate("/");
  }

  function openShortcuts() {
    setOpen(false);
    onOpenShortcuts?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          refreshRecent();
          setOpen(true);
        }}
        className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        aria-label="Öppna kommandopalett"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Sök…</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
          {modKey} K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Kommandopalett">
        <CommandInput placeholder="Sök sidor och åtgärder…" />
        <CommandList>
          <CommandEmpty>Inget hittades.</CommandEmpty>

          {recentPages.length > 0 ? (
            <>
              <CommandGroup heading="Senast besökt">
                {recentPages.map((page) => (
                  <CommandItem
                    key={page.pathname}
                    value={`Senast ${page.title} ${page.pathname}`}
                    onSelect={() => goTo(page.pathname)}
                    onPointerEnter={() => prefetchFor(page.pathname)}
                  >
                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                    {page.title}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          <CommandGroup heading="Åtgärder">
            <CommandItem
              value="Visa tangentbordsgenvägar hjälp"
              onSelect={openShortcuts}
            >
              <Keyboard className="mr-2 h-4 w-4 text-muted-foreground" />
              Visa genvägar
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={mode === "private" ? "Byt till företagsläge" : "Byt till privat läge"}
              onSelect={switchWorkspace}
            >
              {mode === "private" ? (
                <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
              ) : (
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
              )}
              {mode === "private" ? "Byt till företagsläge" : "Byt till privat läge"}
            </CommandItem>
            <CommandItem
              value="Ny uppgift"
              onSelect={() => goTo("/tasks")}
              onPointerEnter={() => prefetchFor("/tasks")}
            >
              <ListPlus className="mr-2 h-4 w-4 text-muted-foreground" />
              Ny uppgift
              <CommandShortcut>G T</CommandShortcut>
            </CommandItem>
            {mode === "business" ? (
              <>
                <CommandItem
                  value="Ny lead"
                  onSelect={() => goTo("/sales?new=lead")}
                  onPointerEnter={() => prefetchFor("/sales")}
                >
                  <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                  Ny lead
                </CommandItem>
                <CommandItem
                  value="Ny affär"
                  onSelect={() => goTo("/sales?new=deal")}
                  onPointerEnter={() => prefetchFor("/sales")}
                >
                  <TrendingUp className="mr-2 h-4 w-4 text-muted-foreground" />
                  Ny affär
                </CommandItem>
                <CommandItem
                  value="Ny kampanj"
                  onSelect={() => goTo("/marketing?new=campaign")}
                  onPointerEnter={() => prefetchFor("/marketing")}
                >
                  <Megaphone className="mr-2 h-4 w-4 text-muted-foreground" />
                  Ny kampanj
                </CommandItem>
                <CommandItem
                  value="Företagsprofil"
                  onSelect={() => goTo("/company")}
                  onPointerEnter={() => prefetchFor("/company")}
                >
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  Företagsprofil
                  <CommandShortcut>G C</CommandShortcut>
                </CommandItem>
              </>
            ) : null}
            <CommandItem
              value="MCP Intelligence"
              onSelect={() => goTo("/intelligence")}
              onPointerEnter={() => prefetchFor("/intelligence")}
            >
              <Bot className="mr-2 h-4 w-4 text-muted-foreground" />
              MCP Intelligence
              <CommandShortcut>G I</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="AI-inställningar"
              onSelect={() => goTo("/preferences?tab=ai")}
              onPointerEnter={() => prefetchFor("/preferences")}
            >
              <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
              AI-inställningar
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />

          {pageGroups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.key}
                  value={`${navTitleSv(item.key, item.title)} ${item.title}`}
                  onSelect={() => goTo(item.url)}
                  onPointerEnter={() => prefetchFor(item.url)}
                >
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {navTitleSv(item.key, item.title)}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="System">
            {systemItems.map((item) => (
              <CommandItem
                key={item.key}
                value={`${navTitleSv(item.key, item.title)} ${item.title}`}
                onSelect={() => goTo(item.url)}
                onPointerEnter={() => prefetchFor(item.url)}
              >
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {navTitleSv(item.key, item.title)}
              </CommandItem>
            ))}
          </CommandGroup>
          {authMode === "cloud" ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Konto">
                <CommandItem
                  value="Logga ut"
                  onSelect={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                  Logga ut
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
