import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { cn } from "@/lib/utils";
import type { BriefItemKind } from "@/features/daily-brief/buildDailyBrief";
import { briefItemsForRoute, routeModuleLabel } from "@/features/daily-brief/briefForRoute";
import {
  Gauge,
  ListChecks,
  MessageSquare,
  PlugZap,
  Sparkles as SparklesIcon,
  Star,
  Target,
  Zap,
} from "lucide-react";

const KIND_ICON: Record<BriefItemKind, typeof MessageSquare> = {
  connection: PlugZap,
  message: MessageSquare,
  marketing: Gauge,
  lead: Target,
  task: ListChecks,
  recommendation: SparklesIcon,
  review: Star,
  automation: Zap,
};

const SEVERITY_CLASS = {
  critical: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-warning/30 bg-warning/5 text-warning",
  info: "border-primary/20 bg-primary/5 text-foreground",
};

/**
 * Compact global summary — visible on every page except home (which has the
 * full daily brief). Keeps attention items one glance away.
 */
export function GlobalAttentionStrip() {
  const location = useLocation();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { brief, isLoading } = useDailyBriefSummary(businessProfileId);
  const prefetchFor = useRoutePrefetch();
  const [dismissed, setDismissed] = useState(false);

  if (location.pathname === "/" || dismissed || isLoading || brief.allClear) {
    return null;
  }

  const routeItems = briefItemsForRoute(location.pathname, brief.items);
  const topItems = (routeItems.length > 0 ? routeItems : brief.items).slice(0, 4);
  const moduleLabel = routeModuleLabel(location.pathname);
  const stripLabel =
    routeItems.length > 0 && moduleLabel ? `${moduleLabel}` : "Kräver uppmärksamhet";

  return (
    <div className="shrink-0 border-b border-border/60 bg-gradient-to-r from-primary/5 via-card/40 to-muted/10 px-3 py-2 sm:px-4">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{stripLabel}</span>
          <span className="tabular-nums">({brief.actionCount})</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto app-scroll">
          {topItems.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <Link
                key={item.id}
                to={item.to}
                onPointerEnter={() => prefetchFor(item.to.split("?")[0] ?? item.to)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-90",
                  SEVERITY_CLASS[item.severity]
                )}
              >
                <Icon className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                <span className="max-w-[160px] truncate">{item.title}</span>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
              </Link>
            );
          })}
        </div>

        <Link
          to="/"
          className="hidden shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground sm:inline"
        >
          Full översikt
        </Link>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="Dölj sammanfattning"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
