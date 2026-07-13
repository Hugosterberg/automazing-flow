import { useMemo } from "react";
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
import { platformLabel } from "@/lib/platformLabels";
import { buildDailyBrief, type DailyBrief } from "./buildDailyBrief";
import { useUnreadDmCount } from "./useUnreadDmCount";

/**
 * Shared daily-brief data layer — one React Query fan-out used by the home
 * brief, global attention strip, notifications bell and live toasts.
 */
export function useDailyBriefSummary(businessProfileId: string | null | undefined) {
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
    [outreachDoc.data]
  );

  const marketingRoas =
    performance?.roas ?? marketingTrend?.current?.roas ?? cachedRoas ?? null;
  const marketingTrendDown =
    marketingRoas == null || marketingRoas >= 1 ? marketingTrend?.direction === "down" : false;
  const inventoryAlertCount =
    inventoryAlert != null ? inventoryAlert.lowStock + inventoryAlert.outOfStock : 0;

  const brief: DailyBrief = useMemo(() => {
    const nowMs = Date.now();
    const openTasks = tasks.filter(isTaskOpen);
    const leadsToFollowUp = leads.filter(
      (l) =>
        isLeadOpen(l.status) &&
        (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs))
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
  }, [
    automationRuns.byKey,
    connections,
    inventoryAlertCount,
    leads,
    marketingRoas,
    marketingTrendDown,
    outreachQueuePending,
    recommendations,
    reviewsNeedingReply,
    tasks,
    unreadDms,
  ]);

  const isLoading =
    (connectionsLoading || tasksLoading || recsLoading || dmsLoading || leadsLoading) && brief.allClear;

  return { brief, isLoading };
}
