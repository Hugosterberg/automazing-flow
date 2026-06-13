import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Search } from "lucide-react";
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
  navItems,
  topNavItems,
  type NavGroup,
} from "@/components/navConfig";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { useAuth } from "@/context/AuthContext";

/**
 * Page groups shown in the palette. Mirrors the sidebar: Work and
 * Productivity come from `navItems`; Connections/Preferences live in
 * `topNavItems` and surface here under the System heading.
 */
const PAGE_GROUPS: Array<{ label: string; items: typeof navItems }> = (
  ["work", "productivity"] as NavGroup[]
).map((group) => ({
  label: NAV_GROUP_LABELS[group],
  items: navItems.filter((item) => item.group === group),
}));

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
          {PAGE_GROUPS.map((group) => (
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
            {topNavItems.map((item) => (
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
