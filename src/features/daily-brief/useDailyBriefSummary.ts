import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnections } from "@/features/connections/useConnections";
import { useAiRecommendations } from "@/features/ai-recommendations";
import { useTasks, isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks";
import { useCachedMarketingRoas } from "@/features/marketing";
import { useMarketingCampaigns } from "@/features/marketing/useMarketingCampaigns";
import { useMarketingTrend } from "@/features/marketing/useMarketingTrend";
import { useLeads, isLeadOpen, isFollowUpOverdue, isFollowUpDueToday } from "@/features/leads";
import { useReviewReplyState } from "@/features/reviews";
import {
  useAutomationRuns,
  automationTitleForCronKey,
  usePendingDmDrafts,
} from "@/features/automation";
import { classifyMessageTriage, fetchUnifiedMessagesPreview } from "@/features/messages";
import { useProfileDocument } from "@/features/profile-documents";
import { buildDemoBriefOverlay, useDemoMode } from "@/features/demo";
import { platformLabel } from "@/lib/platformLabels";
import { t } from "@/lib/i18n";
import { buildDailyBrief, type DailyBrief } from "./buildDailyBrief";
import { useActivityFeed } from "@/features/activity/useActivityFeed";
import { useFortnoxSummary } from "@/features/economy";
import { formatCurrency, formatDateCustom } from "@/lib/format";
import { isTaxSettings, upcomingTaxDeadlines } from "@/lib/taxDeadlines";
import type { TaxSettings } from "@/lib/taxDeadlines";
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
  const triagePreview = useQuery({
    queryKey: ["brief-triage-preview", businessProfileId ?? null],
    queryFn: async () => {
      const rows = await fetchUnifiedMessagesPreview(businessProfileId ?? null);
      return rows.filter((m) => {
        const bucket = classifyMessageTriage(m).bucket;
        return bucket === "today" || bucket === "week";
      }).length;
    },
    enabled: Boolean(businessProfileId),
    staleTime: 60_000,
    meta: { silent: true },
  });
  const cachedRoas = useCachedMarketingRoas();
  const { trend: marketingTrend } = useMarketingTrend();
  const { inventoryAlert, performance } = useMarketingCampaigns();
  const { briefPendingCount: reviewsNeedingReply } = useReviewReplyState(businessProfileId);
  const { leads, isLoading: leadsLoading } = useLeads(businessProfileId);
  const automationRuns = useAutomationRuns(businessProfileId ?? null);
  const { count: pendingDmDrafts } = usePendingDmDrafts(businessProfileId);
  const outreachDoc = useProfileDocument<Array<{ status?: string }>>("outreach-queue", []);
  const { enabled: demoEnabled } = useDemoMode();
  const { events: agentEvents } = useActivityFeed(businessProfileId, {
    module: "agent",
    limit: 5,
  });

  const outreachQueuePending = useMemo(
    () => outreachDoc.data.filter((item) => item?.status === "draft" || !item?.status).length,
    [outreachDoc.data]
  );

  // Economy: overdue Fortnox invoices + tax deadlines ≤7 days. Both stay
  // silent until the user has connected Fortnox / saved tax settings once.
  const { overview: fortnoxOverview } = useFortnoxSummary(businessProfileId);
  const overdueInvoices = useMemo(() => {
    if (!fortnoxOverview?.connected || !fortnoxOverview.summary) return null;
    const { overdueCount, overdueSum, currency } = fortnoxOverview.summary;
    if (overdueCount === 0) return null;
    return { count: overdueCount, sumLabel: formatCurrency(overdueSum, currency) };
  }, [fortnoxOverview]);

  const taxSettingsDoc = useProfileDocument<TaxSettings | null>("tax-settings", null);
  const taxDeadlinesSoon = useMemo(() => {
    const settings = taxSettingsDoc.data;
    if (!isTaxSettings(settings)) return [];
    const today = new Date().toLocaleDateString("sv-SE");
    return upcomingTaxDeadlines(settings, today, 7).map((deadline) => ({
      title: t(`dailyBrief:taxKinds.${deadline.kind}`),
      dateLabel: formatDateCustom(`${deadline.date}T12:00:00`, { day: "numeric", month: "long" }),
    }));
  }, [taxSettingsDoc.data]);

  const agentUpdates = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return agentEvents
      .filter((e) => {
        const t = Date.parse(e.occurred_at || "") || 0;
        return t >= dayAgo;
      })
      .map((e) => ({ title: e.summary || t("dailyBrief:agentRun") }));
  }, [agentEvents]);

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

    const demo = demoEnabled ? buildDemoBriefOverlay() : null;
    const take = (live: number, sample: number | undefined) =>
      demo ? Math.max(live, sample ?? 0) : live;

    return buildDailyBrief({
      connectionIssues: connections
        .filter((c) => c.health && c.health !== "healthy" && c.health !== "pending")
        .map((c) => ({ label: platformLabel(c.platform), health: c.health })),
      unreadDms: take(unreadDms, demo?.unreadDms),
      triageAttentionCount: take(triagePreview.data ?? 0, demo?.triageAttentionCount),
      underwaterRoas: marketingRoas != null && marketingRoas < 1 ? marketingRoas : null,
      marketingTrendDown,
      reviewsNeedingReply: take(reviewsNeedingReply, demo?.reviewsNeedingReply),
      inventoryAlertCount,
      leadsToFollowUp,
      outreachQueuePending: take(outreachQueuePending, demo?.outreachQueuePending),
      pendingDmDrafts: take(pendingDmDrafts, demo?.pendingDmDrafts),
      failedAutomations,
      overdueTasks: openTasks.filter((t) => isTaskOverdue(t, nowMs)).map((t) => ({ title: t.title })),
      dueTodayTasks: openTasks.filter((t) => isTaskDueToday(t, nowMs)).map((t) => ({ title: t.title })),
      newRecommendations: recommendations
        .filter((r) => r.status === "new" || r.status === "seen")
        .map((r) => ({ title: r.title })),
      agentUpdates,
      overdueInvoices,
      taxDeadlinesSoon,
    });
  }, [
    agentUpdates,
    overdueInvoices,
    taxDeadlinesSoon,
    automationRuns.byKey,
    connections,
    demoEnabled,
    inventoryAlertCount,
    leads,
    marketingRoas,
    marketingTrendDown,
    outreachQueuePending,
    pendingDmDrafts,
    recommendations,
    reviewsNeedingReply,
    tasks,
    triagePreview.data,
    unreadDms,
  ]);

  const isLoading =
    (connectionsLoading || tasksLoading || recsLoading || dmsLoading || leadsLoading) && brief.allClear;

  return { brief, isLoading };
}
