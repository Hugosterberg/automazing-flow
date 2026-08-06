import { m } from "framer-motion";
import {
  Trash2,
  Pencil,
  ListChecks,
  Sparkles,
  AlertTriangle,
  Activity as ActivityIcon,
  CalendarDays,
  HeartPulse,
  Star,
  MessageSquare,
  UserPlus,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, useSearchParams } from "react-router-dom";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { ProfileList } from "@/components/ProfileList";
import {
  HomeCollapsibleSection,
  JumpCard,
  QuickOverviewCard,
  TodayTile,
} from "@/components/home-widgets";
import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles/useActiveBusinessProfileId";
import { useBusinessProfiles } from "@/features/business-profiles/useBusinessProfiles";
import { CompanyProfileNudge } from "@/features/business-profiles/CompanyProfileNudge";
import { ExperienceBoostCard } from "@/features/business-profiles/ExperienceBoostCard";
import { FirstWinChecklist } from "@/features/onboarding/FirstWinChecklist";
import { WelcomeTour } from "@/features/onboarding/WelcomeTour";
import { WinsTodayStrip } from "@/features/onboarding/WinsTodayStrip";
import { FIRST_WIN_DOC_KEY, type FirstWinDoc } from "@/features/onboarding/firstWin";
import { DemoModeBanner } from "@/features/demo/DemoModeBanner";
import { WeeklyResultsCard } from "@/features/weekly-results/WeeklyResultsCard";
import { quickNavLabel } from "@/features/quick-nav/quickNavLabels";
import { useTranslation } from "react-i18next";
import { useWorkspaceMode } from "@/features/workspace-mode/useWorkspaceMode";
import { useConnections } from "@/features/connections/useConnections";
import { SyncFreshnessStrip } from "@/features/connections/SyncFreshnessStrip";
import { healthyPlatformSet } from "@/features/connections/connectionVerified";
import { useProfileDocument } from "@/features/profile-documents/useProfileDocument";
import { AiRecommendationsWidget } from "@/features/ai-recommendations/AiRecommendationsWidget";
import { SmartDailyBrief } from "@/features/daily-brief/SmartDailyBrief";
import { useUnreadDmCount } from "@/features/daily-brief/useUnreadDmCount";
import { useLeads } from "@/features/leads/useLeads";
import { isLeadOpen, isFollowUpOverdue, isFollowUpDueToday } from "@/features/leads/leadHelpers";
import { useReviewReplyState } from "@/features/reviews/useReviewReplyState";
import { MarketPulseCard } from "@/features/intelligence/MarketPulseCard";
import { ApproveDraftsCard } from "@/features/automation/ApproveDraftsCard";
import { FlowAutomationStatusCard } from "@/features/automation/FlowAutomationStatusCard";
import { useAiRecommendations } from "@/features/ai-recommendations/useAiRecommendations";
import { useTasks } from "@/features/tasks/useTasks";
import { isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks/taskFilters";
import { pageFadeUp } from "@/lib/motion";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageHeader } from "@/components/ui/page-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { computeBusinessHealth } from "@/lib/businessHealth";
import { formatNumber } from "@/lib/format";
import { useMarketingCampaigns } from "@/features/marketing/useMarketingCampaigns";
import { useCachedShopifyOps } from "@/features/ecommerce/shopifyOpsCache";
import { useQuickNavPrefs } from "@/features/quick-nav/useQuickNavPrefs";

export default function Index() {
  const { t } = useTranslation();
  const { t: th } = useTranslation("home");
  const { activeProfile, profiles, accounts, removeProfile, updateProfile, activeProfileId } =
    useAccounts();
  const activeBpId = useActiveBusinessProfileIdOptional();
  const homeBusinessProfileId = activeBpId ?? activeProfileId ?? null;
  const { profiles: businessProfiles } = useBusinessProfiles();
  const businessProfile = useMemo(
    () => businessProfiles.find((p) => p.id === homeBusinessProfileId) ?? null,
    [businessProfiles, homeBusinessProfileId]
  );
  const { mode } = useWorkspaceMode();
  const isMobile = useIsMobile();
  const { connections } = useConnections(homeBusinessProfileId);
  const healthyPlatforms = useMemo(() => healthyPlatformSet(connections), [connections]);
  const firstWinDoc = useProfileDocument<FirstWinDoc>(FIRST_WIN_DOC_KEY, {});
  const firstWinDismissed = Boolean(firstWinDoc.data?.dismissedAt);
  const { homeJumpDestinations } = useQuickNavPrefs();
  const prefetchFor = useRoutePrefetch();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    website: "",
    email: "",
    phone: "",
    company: "",
    location: "",
    notes: "",
  });

  const { tasks } = useTasks(homeBusinessProfileId);
  const { recommendations } = useAiRecommendations(homeBusinessProfileId);
  const { unreadDms } = useUnreadDmCount();
  const { leads } = useLeads(homeBusinessProfileId);
  const { briefPendingCount: reviewsNeedingReply } = useReviewReplyState(homeBusinessProfileId);
  const { inventoryAlert } = useMarketingCampaigns();
  const cachedShopifyOps = useCachedShopifyOps();
  const storeAttentionCount =
    (inventoryAlert != null ? inventoryAlert.lowStock + inventoryAlert.outOfStock : 0) +
    (cachedShopifyOps?.totalActions ?? 0);

  const leadsToFollowUp = useMemo(() => {
    const nowMs = Date.now();
    return leads.filter(
      (l) => isLeadOpen(l.status) && (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs))
    ).length;
  }, [leads]);

  // Split open tasks by urgency so the home tile can surface the most
  // actionable bucket first (overdue → due-today → open). Without this the
  // user sees a generic "12 open tasks" number with no sense of what
  // actually needs attention today.
  const { openTasks, overdueTasks, dueTodayTasks } = useMemo(() => {
    const nowMs = Date.now();
    const open = tasks.filter(isTaskOpen);
    const overdue = open.filter((t) => isTaskOverdue(t, nowMs));
    const dueToday = open.filter((t) => isTaskDueToday(t, nowMs));
    return { openTasks: open, overdueTasks: overdue, dueTodayTasks: dueToday };
  }, [tasks]);

  /**
   * Derive the headline number shown in the Tasks tile. Prioritised
   * so the most urgent bucket always wins the value slot: overdue →
   * due-today → open → all clear. `to` opens the Tasks board with the
   * relevant context preserved in the URL for existing deep links.
   */
  const tasksTile = useMemo(() => {
    if (overdueTasks.length > 0) {
      const dueTodayHint =
        dueTodayTasks.length > 0
          ? th("attention.tasksPlusToday", { count: dueTodayTasks.length })
          : th("attention.tasksMoreOpen", { count: openTasks.length - overdueTasks.length });
      return {
        title: th("attention.tasksOverdue"),
        value: overdueTasks.length,
        hint: dueTodayHint,
        tone: "warning" as const,
        to: "/tasks?view=overdue",
      };
    }
    if (dueTodayTasks.length > 0) {
      return {
        title: th("attention.tasksDueToday"),
        value: dueTodayTasks.length,
        hint: th("attention.tasksMoreOpen", { count: openTasks.length - dueTodayTasks.length }),
        tone: "info" as const,
        to: "/tasks",
      };
    }
    if (openTasks.length > 0) {
      return {
        title: th("attention.tasksOpen"),
        value: openTasks.length,
        hint: th("attention.tasksDoneCount", { count: tasks.length - openTasks.length }),
        tone: "default" as const,
        to: "/tasks",
      };
    }
    return {
      title: th("attention.tasksOpen"),
      value: 0,
      hint: th("attention.tasksAllClear"),
      tone: "success" as const,
      to: "/tasks",
    };
  }, [openTasks, overdueTasks, dueTodayTasks, tasks.length, th]);
  const activeRecs = useMemo(
    () =>
      recommendations.filter(
        (r) => r.status === "new" || r.status === "seen"
      ),
    [recommendations]
  );
  const connectionIssues = useMemo(() => {
    // Surface connections that need user attention. We treat anything
    // other than "healthy"/"pending" as an issue so the home dashboard is
    // honest about what the user still needs to fix. Health lives on the
    // connections view (not on ConnectedAccount), so read it from there.
    return connections.filter(
      (c) => c.health && c.health !== "healthy" && c.health !== "pending"
    );
  }, [connections]);

  // One glanceable number for "how is this business doing operationally".
  // Weighs the same signals the tiles below already show; see businessHealth.ts.
  const health = useMemo(
    () =>
      computeBusinessHealth({
        connectionIssues: connectionIssues.length,
        overdueTasks: overdueTasks.length,
        dueTodayTasks: dueTodayTasks.length,
        activeRecommendations: activeRecs.length,
        unreadMessages: unreadDms,
        leadsToFollowUp,
        reviewsNeedingReply,
      }),
    [connectionIssues.length, overdueTasks.length, dueTodayTasks.length, activeRecs.length, unreadDms, leadsToFollowUp, reviewsNeedingReply]
  );

  const profileSummary = useMemo(() => {
    const connectedCount = accounts.length;
    const grouped = accounts.reduce<Record<string, number>>((acc, account) => {
      acc[account.platform] = (acc[account.platform] || 0) + 1;
      return acc;
    }, {});
    const platformText = Object.entries(grouped)
      .map(
        ([platform, count]) => `${platformLabel(platform)} (${count})`
      )
      .join(", ");

    const withLoadedData = accounts.filter(
      (a) => Boolean(a.stats || a.analysis)
    ).length;
    const firstAnalysis = accounts.find(
      (a) => a.analysis?.about || a.analysis?.writes || a.analysis?.perception
    )?.analysis;
    const profileText =
      firstAnalysis?.about ||
      firstAnalysis?.writes ||
      firstAnalysis?.perception ||
      "";

    return { connectedCount, platformText, withLoadedData, profileText };
  }, [accounts]);

  const showPagePurpose =
    !firstWinDismissed && healthyPlatforms.size === 0 && profileSummary.connectedCount === 0;

  /**
   * Desktop keeps insertion order. Mobile ranks by urgency (tasks → messages →
   * reviews → leads, then attention signals) and shows the top four first.
   */
  const todayTiles = useMemo(() => {
    type TodayTileConfig = {
      id: string;
      urgency: number;
      title: string;
      value: React.ReactNode;
      hint?: string;
      icon: React.ComponentType<{ className?: string }>;
      to: string;
      tone?: "default" | "warning" | "info" | "success";
    };

    const tiles: TodayTileConfig[] = [];

    if (mode === "business") {
      const healthLabel =
        health.label === "Excellent"
          ? th("health.excellent")
          : health.label === "Good"
            ? th("health.good")
            : th("health.needsAttention");
      tiles.push({
        id: "health",
        urgency: 40,
        title: th("health.title", { label: healthLabel }),
        value: health.score,
        hint: health.topReason ?? th("health.allGood"),
        icon: HeartPulse,
        to: "/activity",
        tone: health.tone,
      });
    }

    tiles.push({
      id: "tasks",
      urgency:
        400 +
        (overdueTasks.length > 0
          ? 50
          : dueTodayTasks.length > 0
            ? 30
            : openTasks.length > 0
              ? 10
              : 0),
      title: tasksTile.title,
      value: tasksTile.value,
      hint: tasksTile.hint,
      icon: ListChecks,
      to: tasksTile.to,
      tone: tasksTile.tone,
    });

    tiles.push({
      id: "messages",
      urgency: 300 + unreadDms,
      title: th("attention.unreadMessages"),
      value: unreadDms,
      hint: unreadDms === 0 ? th("attention.inboxEmpty") : th("attention.repliesWaiting"),
      icon: MessageSquare,
      to: "/messages",
      tone: unreadDms > 0 ? "info" : "default",
    });

    if (mode === "business") {
      tiles.push({
        id: "leads",
        urgency: 200 + leadsToFollowUp,
        title: th("attention.leadsFollowUp"),
        value: leadsToFollowUp,
        hint: leadsToFollowUp === 0 ? th("attention.pipelineGood") : th("attention.leadsDueOrOverdue"),
        icon: UserPlus,
        to: "/sales?view=followups",
        tone: leadsToFollowUp > 0 ? "warning" : "default",
      });
    }

    if (reviewsNeedingReply > 0) {
      tiles.push({
        id: "reviews",
        urgency: 250 + reviewsNeedingReply,
        title: th("attention.reviewsReply"),
        value: reviewsNeedingReply,
        hint: th("attention.reviewsHint"),
        icon: Star,
        to: "/reviews?filter=needs_reply",
        tone: "warning",
      });
    }

    if (mode === "business" && storeAttentionCount > 0) {
      tiles.push({
        id: "store",
        urgency: 150 + storeAttentionCount,
        title: th("attention.storeAttention"),
        value: storeAttentionCount,
        hint: inventoryAlert?.outOfStock
          ? th("attention.storeOutOfStock", { count: inventoryAlert.outOfStock })
          : th("attention.storeLowStock"),
        icon: ShoppingBag,
        to:
          (cachedShopifyOps?.staleUnfulfilled ?? 0) > 0 ||
          (cachedShopifyOps?.pendingPayments ?? 0) > 0
            ? "/ecommerce?tab=orders"
            : "/ecommerce?tab=products",
        tone: "warning",
      });
    }

    tiles.push({
      id: "recs",
      urgency: 50 + activeRecs.length,
      title: th("attention.aiRecs"),
      value: activeRecs.length,
      hint:
        activeRecs.length === 0
          ? th("attention.aiRecsEmpty")
          : th("attention.aiRecsHint"),
      icon: Sparkles,
      to: "/ai-recommendations",
      tone: activeRecs.length > 0 ? "info" : "default",
    });

    tiles.push({
      id: "connections",
      urgency: connectionIssues.length > 0 ? 80 + connectionIssues.length : 20,
      title: th("attention.connectionIssues"),
      value: connectionIssues.length,
      hint: connectionIssues.length === 0 ? th("attention.connectionsOk") : th("attention.connectionsFix"),
      icon: AlertTriangle,
      to: "/connections",
      tone: connectionIssues.length > 0 ? "warning" : "success",
    });

    return tiles;
  }, [
    mode,
    health.label,
    health.score,
    health.topReason,
    health.tone,
    overdueTasks.length,
    dueTodayTasks.length,
    openTasks.length,
    tasksTile,
    unreadDms,
    leadsToFollowUp,
    reviewsNeedingReply,
    storeAttentionCount,
    inventoryAlert?.outOfStock,
    cachedShopifyOps?.staleUnfulfilled,
    cachedShopifyOps?.pendingPayments,
    activeRecs.length,
    connectionIssues.length,
    th,
  ]);

  /**
   * Data for the "Snabböversikt" strip. Cards only appear when the user has
   * accounts in that area, so the strip never renders empty frames.
   */
  const quickOverviewCards = useMemo(() => {
    type QuickCard = {
      key: string;
      to: string;
      icon: React.ComponentType<{ className?: string }>;
      iconClass: string;
      value: React.ReactNode;
      label: string;
      hint: string;
    };
    const cards: QuickCard[] = [];

    // Reviews are business-only (the Reviews page is fenced off in Private).
    if (mode !== "private") {
      const reviewAccounts = accounts.filter(
        (a) => a.platform === "google_reviews" || a.platform === "tripadvisor" || a.platform === "judgeme"
      );
      if (reviewAccounts.length > 0) {
        const ratings = reviewAccounts
          .map((a) => a.stats?.averageRating)
          .filter((r): r is number => typeof r === "number");
        const avgRating =
          ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;
        const totalReviews = reviewAccounts.reduce((s, a) => s + (a.stats?.reviewCount ?? 0), 0);
        cards.push({
          key: "reviews",
          to: "/reviews",
          icon: Star,
          iconClass: "text-yellow-500",
          value: avgRating > 0 ? avgRating.toFixed(1) : "–",
          label: th("overview.avgRating"),
          hint:
            totalReviews > 0
              ? th("overview.reviewsCount", { count: formatNumber(totalReviews) })
              : th("overview.noReviews"),
        });
      }
    }

    const calAccounts = accounts.filter(
      (a) => a.platform === "google_calendar" || a.platform === "outlook_calendar"
    );
    if (calAccounts.length > 0) {
      cards.push({
        key: "calendar",
        to: "/calendar",
        icon: CalendarDays,
        iconClass: "text-blue-500",
        value: calAccounts.length,
        label: th("overview.calendar", { count: calAccounts.length }),
        hint: calAccounts.map((a) => a.username).join(", "),
      });
    }

    const mailAccounts = accounts.filter(
      (a) => a.platform === "gmail" || a.platform === "outlook"
    );
    if (mailAccounts.length > 0) {
      cards.push({
        key: "mail",
        to: "/messages",
        icon: MessageSquare,
        iconClass: "text-primary",
        value: mailAccounts.length,
        label: th("overview.mail", { count: mailAccounts.length }),
        hint: mailAccounts.map((a) => (a.platform === "gmail" ? "Gmail" : "Outlook")).join(", "),
      });
    }

    return cards;
  }, [accounts, mode, th]);

  const { primaryTodayTiles, moreTodayTiles } = useMemo(() => {
    if (!isMobile) {
      return { primaryTodayTiles: todayTiles, moreTodayTiles: [] as typeof todayTiles };
    }
    const ranked = [...todayTiles].sort((a, b) => b.urgency - a.urgency);
    return {
      primaryTodayTiles: ranked.slice(0, 4),
      moreTodayTiles: ranked.slice(4),
    };
  }, [isMobile, todayTiles]);

  useEffect(() => {
    if (!activeProfile) return;
    setProfileForm({
      name: activeProfile.name || "",
      website: activeProfile.website || "",
      email: activeProfile.email || "",
      phone: activeProfile.phone || "",
      company: activeProfile.company || "",
      location: activeProfile.location || "",
      notes: activeProfile.notes || "",
    });
  }, [activeProfile]);

  function saveProfileEdits() {
    if (!activeProfile) return;
    updateProfile(activeProfile.id, profileForm);
    setEditOpen(false);
  }

  const [searchParams, setSearchParams] = useSearchParams();
  type HomeTab = "today" | "pulse" | "more";
  const HOME_TABS: HomeTab[] = ["today", "pulse", "more"];
  const rawHomeTab = searchParams.get("tab");
  const homeTab: HomeTab =
    rawHomeTab && (HOME_TABS as string[]).includes(rawHomeTab)
      ? (rawHomeTab as HomeTab)
      : "today";

  function setHomeTab(tab: HomeTab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "today") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  const showPulseTab = mode === "business";

  return (
    <m.div
      {...pageFadeUp}
      transition={{ duration: 0.3 }}
      className="flex flex-col space-y-6 max-w-5xl w-full mx-auto"
    >
      <PageHeader
        title={activeProfile?.name || th("title")}
        description={
          profileSummary.connectedCount > 0 ? (
            <>
              {th("header.connected", { count: profileSummary.connectedCount })}
              {profileSummary.platformText ? ` · ${profileSummary.platformText}` : ""}
            </>
          ) : (
            th("header.none")
          )
        }
      />

      {/* SmartDailyBrief owns the teaching — keep SmartBar live-only after first win. */}
      <PageSmartBar
        title={th("smartBarTitle")}
        showPurpose={showPagePurpose}
        liveHintOverride={
          health.score < 100 && health.topReason
            ? `${
                health.label === "Excellent"
                  ? th("health.excellent")
                  : health.label === "Good"
                    ? th("health.good")
                    : th("health.needsAttention")
              } (${health.score}/100) — ${health.topReason}`
            : health.score >= 100
              ? th("header.allClear")
              : profileSummary.connectedCount === 0
                ? th("header.noneBrief")
                : null
        }
        extraActions={
          profileSummary.connectedCount === 0
            ? [{ label: th("header.openConnections"), to: "/connections?wizard=1" }]
            : []
        }
      />

      {/* First-login tour; renders nothing once seen. Mounted outside the
          tab conditional so it greets the user regardless of active tab. */}
      <WelcomeTour kind={businessProfile?.kind} connectedCount={accounts.length} />

      <PageModeTabs
        value={homeTab === "pulse" && !showPulseTab ? "today" : homeTab}
        aria-label={th("tabs.aria")}
        onChange={setHomeTab}
        options={[
          { value: "today", label: th("tabs.today") },
          ...(showPulseTab ? [{ value: "pulse" as const, label: th("tabs.pulse") }] : []),
          { value: "more", label: th("tabs.more") },
        ]}
      />

      {homeTab === "today" || (homeTab === "pulse" && !showPulseTab) ? (
      <>
      <SmartDailyBrief businessProfileId={homeBusinessProfileId} />

      <div className="space-y-2 px-3 sm:px-0">
        <FirstWinChecklist
          profile={businessProfile}
          healthyPlatforms={healthyPlatforms}
          connectedPlatforms={accounts.map((a) => a.platform)}
        />
        <DemoModeBanner offerEnable={profileSummary.connectedCount === 0} />
        <ApproveDraftsCard businessProfileId={homeBusinessProfileId} compact />
        <WinsTodayStrip businessProfileId={homeBusinessProfileId} />
        <WeeklyResultsCard
          businessProfileId={homeBusinessProfileId}
          businessName={businessProfile?.name || activeProfile?.name}
        />
      </div>

      {mode === "business" && isMobile && firstWinDismissed ? (
        <ExperienceBoostCard
          profile={businessProfile}
          connectedCount={profileSummary.connectedCount}
          attentionCount={connectionIssues.length}
        />
      ) : null}

      <section aria-label={th("today.aria")} className="app-workspace-shell !min-h-0 space-y-3 p-3 sm:space-y-2 sm:p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-sm">{th("today.heading")}</h2>
          <Link
            to="/activity"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1 sm:text-xs"
          >
            <ActivityIcon className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            {th("today.activity")}
          </Link>
        </div>
        <SyncFreshnessStrip businessProfileId={homeBusinessProfileId} />
        <div
          className={cn(
            "grid grid-cols-2 gap-2.5 sm:gap-3",
            mode === "business" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"
          )}
        >
          {primaryTodayTiles.map((tile) => (
            <TodayTile
              key={tile.id}
              title={tile.title}
              value={tile.value}
              hint={tile.hint}
              icon={tile.icon}
              to={tile.to}
              tone={tile.tone}
              onPrefetch={prefetchFor}
            />
          ))}
        </div>
        {moreTodayTiles.length > 0 ? (
          <HomeCollapsibleSection title={th("sections.moreToday")} ariaLabel={th("sections.moreToday")}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-1 sm:gap-3">
              {moreTodayTiles.map((tile) => (
                <TodayTile
                  key={tile.id}
                  title={tile.title}
                  value={tile.value}
                  hint={tile.hint}
                  icon={tile.icon}
                  to={tile.to}
                  tone={tile.tone}
                  onPrefetch={prefetchFor}
                />
              ))}
            </div>
          </HomeCollapsibleSection>
        ) : null}
      </section>
      </>
      ) : null}

      {homeTab === "pulse" && showPulseTab ? (
        <MarketPulseCard businessProfileId={homeBusinessProfileId} />
      ) : null}

      {homeTab === "more" ? (
      <div className="space-y-4">
      {profiles.length > 2 ? <ProfileList /> : null}
      {mode === "business" && !isMobile ? <CompanyProfileNudge profile={businessProfile} /> : null}
      {activeProfile ? (
        <HomeCollapsibleSection
          title={th("sections.profileDetails")}
          ariaLabel={th("sections.profileDetails")}
          actions={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors"
                aria-label={`Redigera profil ${activeProfile.name}`}
              >
                <Pencil className="h-3 w-3" />
                Redigera
              </button>
              {profiles.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                  aria-label={th("profile.deleteAria", { name: activeProfile.name })}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          }
        >
          <Card className="border-border bg-card">
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="text-muted-foreground">
                {th("profile.loaded", {
                  loaded: profileSummary.withLoadedData,
                  total: profileSummary.connectedCount,
                  accountsSuffix: th("header.accountsSuffix", { count: profileSummary.connectedCount }),
                })}
              </p>
              {profileSummary.profileText ? (
                <p className="text-foreground border-t border-border/70 pt-2">
                  {profileSummary.profileText}
                </p>
              ) : null}
              {(activeProfile.website ||
                activeProfile.email ||
                activeProfile.phone ||
                activeProfile.location) && (
                <dl className="grid gap-1 border-t border-border/70 pt-2 text-xs text-muted-foreground/80">
                  {activeProfile.website ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">{th("profile.web")}</dt>
                      <dd className="min-w-0 break-all">{activeProfile.website}</dd>
                    </div>
                  ) : null}
                  {activeProfile.email ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">{th("profile.email")}</dt>
                      <dd className="min-w-0 break-all">{activeProfile.email}</dd>
                    </div>
                  ) : null}
                  {activeProfile.phone ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">{th("profile.phone")}</dt>
                      <dd className="min-w-0">{activeProfile.phone}</dd>
                    </div>
                  ) : null}
                  {activeProfile.location ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">{th("profile.location")}</dt>
                      <dd className="min-w-0">{activeProfile.location}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </CardContent>
          </Card>
        </HomeCollapsibleSection>
      ) : null}

      {homeBusinessProfileId ? (
        <HomeCollapsibleSection title={th("sections.aiSuggestions")} ariaLabel={th("sections.aiSuggestions")}>
          <AiRecommendationsWidget businessProfileId={homeBusinessProfileId} />
        </HomeCollapsibleSection>
      ) : null}

      {quickOverviewCards.length > 0 ? (
        <HomeCollapsibleSection title={th("sections.quickOverview")} ariaLabel={th("sections.quickOverview")}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickOverviewCards.map((card) => (
              <QuickOverviewCard
                key={card.key}
                to={card.to}
                icon={card.icon}
                iconClass={card.iconClass}
                value={card.value}
                label={card.label}
                hint={card.hint}
                onPrefetch={prefetchFor}
              />
            ))}
          </div>
        </HomeCollapsibleSection>
      ) : null}

      <HomeCollapsibleSection title={th("sections.automationsWorking")} ariaLabel={th("sections.automationsWorking")}>
        <FlowAutomationStatusCard businessProfileId={homeBusinessProfileId} />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection title={th("sections.goTo")} ariaLabel={th("sections.goTo")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {homeJumpDestinations.map((dest) => {
            const title = quickNavLabel(dest.key, t);
            return (
              <JumpCard
                key={dest.key}
                to={dest.to}
                icon={dest.icon}
                title={title}
                description={dest.description ?? title}
                onPrefetch={prefetchFor}
              />
            );
          })}
        </div>
      </HomeCollapsibleSection>
      </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{th("editProfile")}</DialogTitle>
            <DialogDescription>
              {th("editProfileDesc")}{" "}
              <Link to="/company" className="font-medium text-primary underline underline-offset-2">
                {th("editProfileCompanyLink")}
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-name">{th("profileName")}</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-company">{th("profile.company")}</Label>
              <Input
                id="profile-company"
                value={profileForm.company}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, company: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-location">{th("profile.location")}</Label>
              <Input
                id="profile-location"
                value={profileForm.location}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, location: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">{th("profile.email")}</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">{th("profile.phone")}</Label>
              <Input
                id="profile-phone"
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-website">{th("profile.website")}</Label>
              <Input
                id="profile-website"
                placeholder="https://example.com"
                value={profileForm.website}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, website: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-notes">{th("profileNotes")}</Label>
              <Textarea
                id="profile-notes"
                placeholder={th("profileNotesPlaceholder")}
                value={profileForm.notes}
                rows={3}
                className="text-sm resize-y min-h-[72px]"
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {th("profile.cancel")}
            </Button>
            <Button onClick={saveProfileEdits} disabled={!activeProfile}>
              {th("profile.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
      >
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {th("profile.deleteTitle", { name: activeProfile?.name || "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {th("profile.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{th("profile.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (activeProfile) removeProfile(activeProfile.id);
                setConfirmDeleteOpen(false);
              }}
            >
              {th("profile.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </m.div>
  );
}
