import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, ListPlus, LogOut, Megaphone, Search, Target, User } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
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

function isMacLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/**
 * Global command palette: ⌘K / Ctrl+K (or the header search button) opens
 * a fuzzy-searchable list of every page plus a few account actions.
 * Renders both the header trigger and the dialog so Layout only mounts
 * one component and the keyboard listener lives in a single place.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const prefetchFor = useRoutePrefetch();
  const { authMode, signOut } = useAuth();
  const { mode, setMode } = useWorkspaceMode();

  // Page groups mirror the sidebar for the current workspace mode: Work and
  // Productivity come from navItems; Connections/Preferences surface under
  // the System heading.
  const modeNavItems = navItemsForMode(mode);
  const pageGroups = (["work", "productivity"] as NavGroup[]).map((group) => ({
    label: NAV_GROUP_LABELS[group],
    items: modeNavItems.filter((item) => item.group === group),
  }));
  const systemItems = topNavItemsForMode(mode);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function goTo(url: string) {
    setOpen(false);
    navigate(url);
  }

  function switchWorkspace() {
    setOpen(false);
    setMode(mode === "private" ? "business" : "private");
    navigate("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span>Search…</span>
        <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
          {isMacLike() ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Command palette">
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem
              value={mode === "private" ? "Switch to Business workspace" : "Switch to Private workspace"}
              onSelect={switchWorkspace}
            >
              {mode === "private" ? (
                <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
              ) : (
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
              )}
              {mode === "private" ? "Switch to Business workspace" : "Switch to Private workspace"}
            </CommandItem>
            <CommandItem
              value="New task"
              onSelect={() => goTo("/tasks")}
              onPointerEnter={() => prefetchFor("/tasks")}
            >
              <ListPlus className="mr-2 h-4 w-4 text-muted-foreground" />
              New task
            </CommandItem>
            {mode === "business" ? (
              <>
                <CommandItem
                  value="New campaign"
                  onSelect={() => goTo("/marketing?new=campaign")}
                  onPointerEnter={() => prefetchFor("/marketing")}
                >
                  <Megaphone className="mr-2 h-4 w-4 text-muted-foreground" />
                  New campaign
                </CommandItem>
                <CommandItem
                  value="New lead"
                  onSelect={() => goTo("/sales?new=lead")}
                  onPointerEnter={() => prefetchFor("/sales")}
                >
                  <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                  New lead
                </CommandItem>
              </>
            ) : null}
          </CommandGroup>
          <CommandSeparator />
          {pageGroups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.key}
                  value={item.title}
                  onSelect={() => goTo(item.url)}
                  onPointerEnter={() => prefetchFor(item.url)}
                >
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="System">
            {systemItems.map((item) => (
              <CommandItem
                key={item.key}
                value={item.title}
                onSelect={() => goTo(item.url)}
                onPointerEnter={() => prefetchFor(item.url)}
              >
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
          {authMode === "cloud" ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Account">
                <CommandItem
                  value="Sign out"
                  onSelect={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                  Sign out
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
