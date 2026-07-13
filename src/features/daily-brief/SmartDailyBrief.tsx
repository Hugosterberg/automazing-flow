import { useMemo, useState } from "react";
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
  X,
  Star,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { useConnections } from "@/features/connections/useConnections";
import { useAiRecommendations } from "@/features/ai-recommendations";
import { useTasks, isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks";
import { useCachedMarketingRoas } from "@/features/marketing";
import { useMarketingCampaigns } from "@/features/marketing/useMarketingCampaigns";
import { useMarketingTrend } from "@/features/marketing/useMarketingTrend";
import { useLeads, isLeadOpen, isFollowUpOverdue, isFollowUpDueToday } from "@/features/leads";
import { useReviewReplyState } from "@/features/reviews";
import { useAutomationRuns, automationTitleForCronKey } from "@/features/automation";
import { useProfileDocument } from "@/features/profile-documents";
import { buildDailyBrief, type BriefItem, type BriefItemKind, type BriefSeverity } from "./buildDailyBrief";
import { getBriefDayState, markBriefItemDone, snoozeBriefItem } from "./dailyBriefDismiss";
import { useUnreadDmCount } from "./useUnreadDmCount";

const KIND_ICON: Record<BriefItemKind, React.ComponentType<{ className?: string }>> = {
  connection: PlugZap,
  message: MessageSquare,
  marketing: Gauge,
  lead: UserPlus,
  task: ListChecks,
  recommendation: Sparkles,
  review: Star,
  automation: Zap,
};

const SEVERITY_STYLES: Record<BriefSeverity, { icon: string; chip: string }> = {
  critical: { icon: "text-destructive", chip: "bg-destructive/10 text-destructive" },
  warning: { icon: "text-warning", chip: "bg-warning/10 text-warning" },
  info: { icon: "text-info", chip: "bg-info/10 text-info" },
};

function BriefRow({
  item,
  onPrefetch,
  onDone,
  onSnooze,
}: {
  item: BriefItem;
  onPrefetch?: (to: string) => void;
  onDone?: (id: string) => void;
  onSnooze?: (id: string) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const styles = SEVERITY_STYLES[item.severity];
  return (
    <div className="group relative flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <Link
        to={item.to}
        onPointerEnter={() => onPrefetch?.(item.to)}
        onFocus={() => onPrefetch?.(item.to)}
        className="flex min-w-0 flex-1 items-center gap-3"
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
      {onDone ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-success opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Mark as done"
          title="Mark as done"
          onClick={() => onDone(item.id)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {onSnooze ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Snooze until tomorrow"
          title="Snooze until tomorrow"
          onClick={() => onSnooze(item.id)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
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
  const [dayState, setDayState] = useState(() => getBriefDayState());
  const dismissedIds = useMemo(
    () => new Set([...dayState.done, ...dayState.snoozed]),
    [dayState]
  );
  const { connections, isLoading: connectionsLoading } = useConnections(businessProfileId);
  const { tasks, isLoading: tasksLoading } = useTasks(businessProfileId);
  const { recommendations, isLoading: recsLoading } = useAiRecommendations(businessProfileId);
  const { unreadDms, isLoading: dmsLoading } = useUnreadDmCount();
  const cachedRoas = useCachedMarketingRoas();
  const { trend: marketingTrend } = useMarketingTrend();
  const { inventoryAlert, performance } = useMarketingCampaigns();
  const { briefPendingCount: reviewsNeedingReply } = useReviewReplyState(businessProfileId);
  const { leads, isLoading: leadsLoading } = useLeads(businessProfileId);
  const automationRuns = useAutomationRuns(businessProfileId ?? null);
  const outreachDoc = useProfileDocument<Array<{ status?: string }>>("outreach-queue", []);
  const outreachQueuePending = useMemo(
    () => outreachDoc.data.filter((item) => item?.status === "draft" || !item?.status).length,
    [outreachDoc.data],
  );

  const marketingRoas =
    performance?.roas ?? marketingTrend?.current?.roas ?? cachedRoas ?? null;
  const marketingTrendDown =
    marketingRoas == null || marketingRoas >= 1 ? marketingTrend?.direction === "down" : false;
  const inventoryAlertCount =
    inventoryAlert != null ? inventoryAlert.lowStock + inventoryAlert.outOfStock : 0;

  const brief = useMemo(() => {
    const nowMs = Date.now();
    const openTasks = tasks.filter(isTaskOpen);
    const leadsToFollowUp = leads.filter(
      (l) => isLeadOpen(l.status) && (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs)),
    ).length;
    const failedAutomations = Object.values(automationRuns.byKey)
      .filter((run) => run.lastRun?.status === "failed")
      .map((run) => ({ title: automationTitleForCronKey(run.key) }));
    return buildDailyBrief({
      connectionIssues: connections
        .filter((c) => c.health && c.health !== "healthy" && c.health !== "pending")
        .map((c) => ({ label: platformLabel(c.platform), health: c.health })),
      unreadDms,
      underwaterRoas: marketingRoas != null && marketingRoas < 1 ? marketingRoas : null,
      marketingTrendDown,
      reviewsNeedingReply,
      inventoryAlertCount,
      leadsToFollowUp,
      outreachQueuePending,
      failedAutomations,
      overdueTasks: openTasks.filter((t) => isTaskOverdue(t, nowMs)).map((t) => ({ title: t.title })),
      dueTodayTasks: openTasks.filter((t) => isTaskDueToday(t, nowMs)).map((t) => ({ title: t.title })),
      newRecommendations: recommendations
        .filter((r) => r.status === "new" || r.status === "seen")
        .map((r) => ({ title: r.title })),
    });
  }, [connections, tasks, recommendations, unreadDms, marketingRoas, marketingTrendDown, reviewsNeedingReply, inventoryAlertCount, leads, outreachQueuePending, automationRuns.byKey]);

  const visibleItems = useMemo(
    () => brief.items.filter((item) => !dismissedIds.has(item.id)),
    [brief.items, dismissedIds]
  );
  const visibleActionCount = visibleItems.reduce((sum, item) => sum + item.count, 0);
  const visibleAllClear = visibleItems.length === 0;

  // Progress: how many of today's brief items were marked done. Only ids that
  // exist in today's brief count, so stale localStorage ids don't inflate it.
  const briefIds = useMemo(() => new Set(brief.items.map((i) => i.id)), [brief.items]);
  const doneCount = dayState.done.filter((id) => briefIds.has(id)).length;
  const progressTotal = visibleItems.length + doneCount;

  function handleDone(id: string) {
    markBriefItemDone(id);
    setDayState(getBriefDayState());
  }

  function handleSnooze(id: string) {
    snoozeBriefItem(id);
    setDayState(getBriefDayState());
  }

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
            visibleAllClear ? "bg-success/10" : "bg-primary/10"
          )}
        >
          {visibleAllClear ? (
            <Sun className="h-5 w-5 text-success" aria-hidden />
          ) : (
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Today's brief</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isInitialLoading
              ? "Putting together your brief…"
              : visibleAllClear
              ? doneCount > 0
                ? `All ${progressTotal} handled — nice work.`
                : "You're all caught up for now."
              : brief.subline}
          </p>
        </div>
        {!isInitialLoading && doneCount > 0 && !visibleAllClear ? (
          <span
            className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success tabular-nums shrink-0"
            title={`${doneCount} of ${progressTotal} done today`}
          >
            {doneCount}/{progressTotal}
            <CheckCircle2 className="inline h-3 w-3 ml-1 align-[-1.5px]" aria-hidden />
          </span>
        ) : null}
        {!visibleAllClear && !isInitialLoading ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums shrink-0">
            {visibleActionCount}
          </span>
        ) : null}
      </div>

      {!isInitialLoading && progressTotal > 0 && doneCount > 0 ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${Math.round((doneCount / progressTotal) * 100)}%` }}
          />
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-14 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      ) : visibleAllClear ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3.5 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
          <span>Connections are healthy, tasks are under control, and there's nothing new to review.</span>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <BriefRow
                item={item}
                onPrefetch={prefetchFor}
                onDone={handleDone}
                onSnooze={handleSnooze}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
