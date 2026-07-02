import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  ListChecks,
  MessageSquare,
  PlugZap,
  Sparkles,
  Sun,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { useConnections } from "@/features/connections/useConnections";
import { useAiRecommendations } from "@/features/ai-recommendations";
import { useTasks, isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks";
import { useCachedMarketingRoas } from "@/features/marketing";
import { useLeads, isLeadOpen, isFollowUpOverdue, isFollowUpDueToday } from "@/features/leads";
import { buildDailyBrief, type BriefItem, type BriefItemKind, type BriefSeverity } from "./buildDailyBrief";
import { useUnreadDmCount } from "./useUnreadDmCount";

const KIND_ICON: Record<BriefItemKind, React.ComponentType<{ className?: string }>> = {
  connection: PlugZap,
  message: MessageSquare,
  marketing: Gauge,
  lead: UserPlus,
  task: ListChecks,
  recommendation: Sparkles,
};

const SEVERITY_STYLES: Record<BriefSeverity, { icon: string; chip: string }> = {
  critical: { icon: "text-destructive", chip: "bg-destructive/10 text-destructive" },
  warning: { icon: "text-warning", chip: "bg-warning/10 text-warning" },
  info: { icon: "text-info", chip: "bg-info/10 text-info" },
};

function BriefRow({
  item,
  onPrefetch,
}: {
  item: BriefItem;
  onPrefetch?: (to: string) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const styles = SEVERITY_STYLES[item.severity];
  return (
    <Link
      to={item.to}
      onPointerEnter={() => onPrefetch?.(item.to)}
      onFocus={() => onPrefetch?.(item.to)}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3.5 py-3 transition-colors",
        "hover:border-primary/40 hover:bg-accent/40"
      )}
    >
      <div className={cn("rounded-md p-2 shrink-0", styles.chip)}>
        <Icon className={cn("h-4 w-4", styles.icon)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

/**
 * Smart Daily Brief — a single prioritised "what to do now" list that ranks
 * actions across connections, tasks and AI recommendations. Complements the
 * stat tiles on the home page (which show counts) by telling the user exactly
 * where to start. Self-contained: it reads the same React Query caches the
 * rest of the home page uses, so it adds no extra network cost.
 */
export function SmartDailyBrief({
  businessProfileId,
}: {
  businessProfileId: string | null | undefined;
}) {
  const prefetchFor = useRoutePrefetch();
  const { connections, isLoading: connectionsLoading } = useConnections(businessProfileId);
  const { tasks, isLoading: tasksLoading } = useTasks(businessProfileId);
  const { recommendations, isLoading: recsLoading } = useAiRecommendations(businessProfileId);
  const { unreadDms, isLoading: dmsLoading } = useUnreadDmCount();
  const marketingRoas = useCachedMarketingRoas();
  const { leads, isLoading: leadsLoading } = useLeads(businessProfileId);

  const brief = useMemo(() => {
    const nowMs = Date.now();
    const openTasks = tasks.filter(isTaskOpen);
    const leadsToFollowUp = leads.filter(
      (l) => isLeadOpen(l.status) && (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs)),
    ).length;
    return buildDailyBrief({
      connectionIssues: connections
        .filter((c) => c.health && c.health !== "healthy" && c.health !== "pending")
        .map((c) => ({ label: platformLabel(c.platform), health: c.health })),
      unreadDms,
      underwaterRoas: marketingRoas,
      leadsToFollowUp,
      overdueTasks: openTasks.filter((t) => isTaskOverdue(t, nowMs)).map((t) => ({ title: t.title })),
      dueTodayTasks: openTasks.filter((t) => isTaskDueToday(t, nowMs)).map((t) => ({ title: t.title })),
      newRecommendations: recommendations
        .filter((r) => r.status === "new" || r.status === "seen")
        .map((r) => ({ title: r.title })),
    });
  }, [connections, tasks, recommendations, unreadDms, marketingRoas, leads]);

  // Avoid flashing "all caught up" before the first data lands.
  const isInitialLoading =
    (connectionsLoading || tasksLoading || recsLoading || dmsLoading || leadsLoading) &&
    brief.allClear;

  return (
    <section
      aria-label="Daily brief"
      className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-5"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-lg p-2 shrink-0",
            brief.allClear ? "bg-success/10" : "bg-primary/10"
          )}
        >
          {brief.allClear ? (
            <Sun className="h-5 w-5 text-success" aria-hidden />
          ) : (
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Today's brief</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isInitialLoading ? "Putting together your brief…" : brief.subline}
          </p>
        </div>
        {!brief.allClear && !isInitialLoading ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums shrink-0">
            {brief.actionCount}
          </span>
        ) : null}
      </div>

      {isInitialLoading ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-14 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      ) : brief.allClear ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3.5 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
          <span>Connections are healthy, tasks are under control, and there's nothing new to review.</span>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {brief.items.map((item) => (
            <li key={item.id}>
              <BriefRow item={item} onPrefetch={prefetchFor} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
