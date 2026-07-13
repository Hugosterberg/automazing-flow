import { Home, ListChecks, MessageSquare, Star } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceMode } from "@/features/workspace-mode";
import { cn } from "@/lib/utils";

const QUICK_NAV = [
  { to: "/", label: "Hem", icon: Home, match: (path: string) => path === "/" },
  { to: "/messages", label: "Meddelanden", icon: MessageSquare, match: (path: string) => path.startsWith("/messages") },
  { to: "/tasks", label: "Uppgifter", icon: ListChecks, match: (path: string) => path.startsWith("/tasks") },
  { to: "/reviews", label: "Recensioner", icon: Star, match: (path: string) => path.startsWith("/reviews") },
] as const;

/**
 * Bottom tab bar on phones — primary routes without opening the sidebar drawer.
 * Hidden on md+ where the sidebar is always visible.
 */
export function MobileQuickNav() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { mode } = useWorkspaceMode();

  if (!isMobile) return null;

  const items = QUICK_NAV.filter((item) => {
    if (mode === "private" && item.to === "/reviews") return false;
    return true;
  });

  return (
    <nav
      aria-label="Snabbnavigering"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md safe-x md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <ul
        className="mx-auto grid max-w-lg gap-0.5 px-1 pt-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors sm:min-h-11 sm:text-xs",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-primary")} aria-hidden />
                <span className="truncate max-w-full leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
