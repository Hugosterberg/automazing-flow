import { useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  Building2,
  CalendarDays,
  Film,
  Home,
  ListChecks,
  Menu,
  MessageSquare,
  PlugZap,
  Share2,
  Star,
  Target,
  Users,
  Zap,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { to: "/", label: "Hem", icon: Home, match: (path: string) => path === "/" },
  { to: "/messages", label: "Mail", icon: MessageSquare, match: (path: string) => path.startsWith("/messages"), badgeKey: "messages" as const },
  { to: "/tasks", label: "Uppgifter", icon: ListChecks, match: (path: string) => path.startsWith("/tasks"), badgeKey: "tasks" as const },
  { to: "/reviews", label: "Recensioner", icon: Star, match: (path: string) => path.startsWith("/reviews"), badgeKey: "reviews" as const },
] as const;

/** Work destinations + permanent setup destinations (always visible when mode allows). */
const MORE_LINKS = [
  { to: "/content", label: "Innehåll", icon: Film },
  { to: "/calendar", label: "Kalender", icon: CalendarDays },
  { to: "/social-media", label: "Socialt", icon: Share2 },
  { to: "/sales", label: "Sales", icon: Target, modes: ["business"] as const },
  { to: "/customers", label: "Kunder", icon: Users, modes: ["business"] as const },
  { to: "/activity", label: "Aktivitet", icon: ActivityIcon },
  { to: "/connections", label: "Kopplingar", icon: PlugZap },
  { to: "/company", label: "Företag", icon: Building2, modes: ["business"] as const },
  { to: "/automations", label: "Automationer", icon: Zap },
] as const;

function BadgeCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Bottom tab bar on phones — primary routes + Mer sheet for secondary destinations.
 * Hidden while a stacked detail pane is open.
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

  const items = PRIMARY_NAV.filter((item) => {
    if (mode === "private" && item.to === "/reviews") return false;
    return true;
  });

  const moreItems = MORE_LINKS.filter((item) => {
    if ("modes" in item && item.modes && !(item.modes as readonly string[]).includes(mode)) {
      return false;
    }
    return isNavUrlAllowedInMode(item.to, mode);
  });
  const moreActive = moreItems.some((item) => pathname.startsWith(item.to));

  return (
    <>
      <nav
        aria-label="Snabbnavigering"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md safe-x md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <ul
          className="mx-auto grid max-w-lg gap-0.5 px-1 pt-1"
          style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
        >
          {items.map(({ to, label, icon: Icon, match, ...rest }) => {
            const active = match(pathname);
            const badgeKey = "badgeKey" in rest ? rest.badgeKey : null;
            const count = badgeKey ? badges[badgeKey] : 0;
            return (
              <li key={to}>
                <Link
                  to={to}
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
                  <span className="truncate max-w-full leading-tight">{label}</span>
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
            {moreItems.map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "relative flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : setupHint?.to === to
                          ? "border-primary/25 bg-primary/[0.04] text-foreground"
                          : "border-border/70 bg-card/40 text-foreground hover:bg-muted/40"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {setupHint?.to === to ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
