import { useMemo, useState } from "react";
import { Home, Menu, Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isNavUrlAllowedInMode } from "@/components/navConfig";
import { useIsMobile, useMobileReadingFocus } from "@/hooks/use-mobile";
import { useWorkspaceMode, WorkspaceModeTabs } from "@/features/workspace-mode";
import {
  useActiveBusinessProfileIdOptional,
  useBusinessProfiles,
  getBusinessProfileCompleteness,
} from "@/features/business-profiles";
import { useAccounts } from "@/context/AccountsContext";
import { useUnreadDmCount } from "@/features/daily-brief";
import { useReviewReplyState } from "@/features/reviews";
import { useTasks, isTaskOpen, isTaskOverdue } from "@/features/tasks";
import { QuickNavPrefsEditor, useQuickNavPrefs } from "@/features/quick-nav";
import { cn } from "@/lib/utils";

function BadgeCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Bottom tab bar on phones — user-chosen primary routes + Mer sheet for the rest.
 * Hem and Mer are always present. Hidden while a stacked detail pane is open.
 */
export function MobileQuickNav() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { mode } = useWorkspaceMode();
  const readingFocus = useMobileReadingFocus();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { profiles } = useBusinessProfiles();
  const { accounts } = useAccounts();
  const [moreOpen, setMoreOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const { primaryDestinations, moreDestinations } = useQuickNavPrefs();

  const { unreadDms } = useUnreadDmCount();
  const { briefPendingCount: reviewsPending } = useReviewReplyState(businessProfileId);
  const { tasks } = useTasks(businessProfileId);
  const overdueTasks = useMemo(
    () => tasks.filter((t) => isTaskOpen(t) && isTaskOverdue(t)).length,
    [tasks]
  );

  const setupHint = useMemo(() => {
    const connectedCount = accounts.filter((a) => !a.disconnectedAt).length;
    if (mode === "private") {
      if (connectedCount === 0) {
        return {
          text: "Koppla mail eller sociala konton under Kopplingar för att fylla inkorg och flöden.",
          to: "/connections" as const,
          cta: "Öppna Kopplingar",
        };
      }
      return null;
    }
    const profile = profiles.find((p) => p.id === businessProfileId) ?? profiles[0] ?? null;
    const completeness = getBusinessProfileCompleteness(profile);
    if (!completeness.isStrong) {
      return {
        text: "Fyll i Företag (beskrivning + webb) så AI och automationer blir mer relevanta.",
        to: "/company" as const,
        cta: "Öppna Företag",
      };
    }
    if (connectedCount === 0) {
      return {
        text: "Koppla mail, socialt eller recensioner för att fylla inkorg och flöden.",
        to: "/connections" as const,
        cta: "Öppna Kopplingar",
      };
    }
    return null;
  }, [mode, profiles, businessProfileId, accounts]);

  const badges = {
    messages: unreadDms,
    tasks: overdueTasks,
    reviews: mode === "business" ? reviewsPending : 0,
  };

  if (!isMobile || readingFocus) return null;

  const moreItems = moreDestinations.filter((item) => isNavUrlAllowedInMode(item.to.split("?")[0]!, mode));
  const moreActive = moreItems.some((item) => item.match(pathname));
  const columnCount = primaryDestinations.length + 2; // Hem + primaries + Mer

  return (
    <>
      <nav
        aria-label="Snabbnavigering"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md safe-x md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <ul
          className="mx-auto grid max-w-lg gap-0.5 px-1 pt-1"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          <li>
            <Link
              to="/"
              className={cn(
                "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                pathname === "/"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Home className={cn("h-5 w-5", pathname === "/" && "text-primary")} aria-hidden />
              <span className="truncate max-w-full leading-tight">Hem</span>
            </Link>
          </li>
          {primaryDestinations.map((dest) => {
            const active = dest.match(pathname);
            const count = dest.badgeKey ? badges[dest.badgeKey] : 0;
            const Icon = dest.icon;
            return (
              <li key={dest.key}>
                <Link
                  to={dest.to}
                  className={cn(
                    "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <span className="relative">
                    <Icon className={cn("h-5 w-5", active && "text-primary")} aria-hidden />
                    <BadgeCount count={count} />
                  </span>
                  <span className="truncate max-w-full leading-tight">{dest.shortLabel}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "relative flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                moreActive || moreOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              aria-label={setupHint ? "Mer — något behöver din uppmärksamhet" : "Mer"}
            >
              <span className="relative">
                <Menu className="h-5 w-5" aria-hidden />
                {setupHint ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span className="leading-tight">Mer</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle className="text-base">Mer</SheetTitle>
          </SheetHeader>
          {setupHint ? (
            <div className="mb-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
              <p className="text-xs leading-relaxed text-muted-foreground">{setupHint.text}</p>
              <Link
                to={setupHint.to}
                onClick={() => setMoreOpen(false)}
                className="mt-1.5 inline-flex text-xs font-medium text-primary"
              >
                {setupHint.cta} →
              </Link>
            </div>
          ) : null}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Läge</p>
            <WorkspaceModeTabs />
          </div>
          <ul className="grid grid-cols-2 gap-2 pb-2">
            {moreItems.map((dest) => {
              const active = dest.match(pathname);
              const Icon = dest.icon;
              return (
                <li key={dest.key}>
                  <Link
                    to={dest.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "relative flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : setupHint?.to === dest.to.split("?")[0]
                          ? "border-primary/25 bg-primary/[0.04] text-foreground"
                          : "border-border/70 bg-card/40 text-foreground hover:bg-muted/40"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{dest.label}</span>
                    {setupHint?.to === dest.to.split("?")[0] ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              setCustomizeOpen(true);
            }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Anpassa genvägar
          </button>
        </SheetContent>
      </Sheet>

      <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Anpassa genvägar</SheetTitle>
          </SheetHeader>
          <QuickNavPrefsEditor compact />
        </SheetContent>
      </Sheet>
    </>
  );
}
