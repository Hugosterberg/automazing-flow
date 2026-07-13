import { useMemo, useState, type ReactNode } from "react";
import { Home, Menu, Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetGrabber } from "@/components/ui/sheet-grabber";
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
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground shadow-sm">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function TabLabel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "truncate max-w-full leading-tight transition-all duration-200",
        active ? "font-semibold opacity-100" : "font-medium opacity-80"
      )}
    >
      {children}
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
  const homeActive = pathname === "/";

  return (
    <>
      <nav
        aria-label="Snabbnavigering"
        className="mobile-tab-bar fixed inset-x-0 bottom-0 z-40 safe-x md:hidden"
      >
        <ul
          className="mx-auto grid max-w-lg gap-0.5 px-1.5 pb-1 pt-1.5"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <li>
            <Link
              to="/"
              className={cn("mobile-tab-item", homeActive && "mobile-tab-item-active")}
              aria-current={homeActive ? "page" : undefined}
            >
              <span className="mobile-tab-icon-wrap">
                <Home className="mobile-tab-icon" aria-hidden />
              </span>
              <TabLabel active={homeActive}>Hem</TabLabel>
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
                  className={cn("mobile-tab-item", active && "mobile-tab-item-active")}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="mobile-tab-icon-wrap relative">
                    <Icon className="mobile-tab-icon" aria-hidden />
                    <BadgeCount count={count} />
                  </span>
                  <TabLabel active={active}>{dest.shortLabel}</TabLabel>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "mobile-tab-item w-full",
                (moreActive || moreOpen) && "mobile-tab-item-active"
              )}
              aria-label={setupHint ? "Mer — något behöver din uppmärksamhet" : "Mer"}
              aria-expanded={moreOpen}
            >
              <span className="mobile-tab-icon-wrap relative">
                <Menu className="mobile-tab-icon" aria-hidden />
                {setupHint ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                    aria-hidden
                  />
                ) : null}
              </span>
              <TabLabel active={moreActive || moreOpen}>Mer</TabLabel>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto px-4">
          <SheetGrabber />
          <SheetHeader className="pb-1 text-left">
            <SheetTitle className="font-display text-base tracking-tight">Mer</SheetTitle>
          </SheetHeader>
          {setupHint ? (
            <div className="mb-3 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2.5">
              <p className="text-xs leading-relaxed text-muted-foreground">{setupHint.text}</p>
              <Link
                to={setupHint.to}
                onClick={() => setMoreOpen(false)}
                className="mt-1.5 inline-flex min-h-10 items-center text-xs font-medium text-primary"
              >
                {setupHint.cta} →
              </Link>
            </div>
          ) : null}
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Läge
            </p>
            <WorkspaceModeTabs fullWidth />
          </div>
          <ul className="grid grid-cols-3 gap-2 pb-1 sm:grid-cols-4">
            {moreItems.map((dest) => {
              const active = dest.match(pathname);
              const Icon = dest.icon;
              const highlighted = setupHint?.to === dest.to.split("?")[0];
              return (
                <li key={dest.key}>
                  <Link
                    to={dest.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-center transition-transform active:scale-[0.96]",
                      active
                        ? "border-primary/35 bg-primary/10 text-primary"
                        : highlighted
                          ? "border-primary/25 bg-primary/[0.04] text-foreground"
                          : "border-border/60 bg-card/50 text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                      {dest.label}
                    </span>
                    {highlighted ? (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
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
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors active:bg-muted/40"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Anpassa genvägar
          </button>
        </SheetContent>
      </Sheet>

      <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-4">
          <SheetGrabber />
          <SheetHeader className="sr-only">
            <SheetTitle>Anpassa genvägar</SheetTitle>
          </SheetHeader>
          <QuickNavPrefsEditor compact />
        </SheetContent>
      </Sheet>
    </>
  );
}
