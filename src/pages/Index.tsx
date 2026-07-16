import { m } from "framer-motion";
import {
  Trash2,
  Pencil,
  ListChecks,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Activity as ActivityIcon,
  CalendarDays,
  HeartPulse,
  Star,
  MessageSquare,
  UserPlus,
  ShoppingBag,
  ChevronDown,
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
import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles, CompanyProfileNudge, ExperienceBoostCard } from "@/features/business-profiles";
import { useWorkspaceMode } from "@/features/workspace-mode";
import { useConnections } from "@/features/connections/useConnections";
import { SyncFreshnessStrip } from "@/features/connections";
import { AiRecommendationsWidget } from "@/features/ai-recommendations";
import { SmartDailyBrief } from "@/features/daily-brief";
import { useUnreadDmCount } from "@/features/daily-brief/useUnreadDmCount";
import { useLeads, isLeadOpen, isFollowUpOverdue, isFollowUpDueToday } from "@/features/leads";
import { useReviewReplyState } from "@/features/reviews";
import { MarketPulseCard } from "@/features/intelligence";
import { FlowAutomationStatusCard } from "@/features/automation";
import { useAiRecommendations } from "@/features/ai-recommendations";
import {
  useTasks,
  isTaskOpen,
  isTaskOverdue,
  isTaskDueToday,
} from "@/features/tasks";
import { pageFadeUp } from "@/lib/motion";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageHeader } from "@/components/ui/page-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { computeBusinessHealth } from "@/lib/businessHealth";
import { formatNumber } from "@/lib/format";
import { useMarketingCampaigns } from "@/features/marketing";
import { useQuickNavPrefs } from "@/features/quick-nav";

/**
 * Today tile — one compact stat with a deep-link. Rendered in the home
 * dashboard grid. Uses tone to map metric to severity so the page reads
 * at a glance without requiring legends.
 */
function TodayTile({
  title,
  value,
  hint,
  icon: Icon,
  to,
  tone = "default",
  onPrefetch,
}: {
  title: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  tone?: "default" | "warning" | "info" | "success";
  onPrefetch?: (to: string) => void;
}) {
  const toneAccent =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : tone === "success"
          ? "text-success"
          : "text-primary";
  const toneSurface =
    tone === "warning"
      ? "mobile-widget-tile-warning"
      : tone === "info"
        ? "mobile-widget-tile-info"
        : tone === "success"
          ? "mobile-widget-tile-success"
          : "";
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className={cn(
        "group pressable mobile-widget-tile block px-3.5 py-3.5 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:px-4 sm:py-4 sm:shadow-none",
        "sm:hover:border-primary/40 sm:hover:bg-accent/40",
        toneSurface
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-background/40 sm:h-auto sm:w-auto sm:rounded-none sm:bg-transparent",
            toneAccent
          )}
        >
          <Icon className={cn("h-4 w-4", toneAccent)} />
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-muted-foreground sm:mt-0.5 sm:text-xs">{title}</p>
      {hint ? (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80 sm:mt-1 sm:text-[11px]">{hint}</p>
      ) : null}
    </Link>
  );
}

/**
 * Compact card for the "Jump to" row at the bottom of the home page.
 * Mirrors the visual language of the AI widget: tinted icon box, left-
 * aligned title + description, hover arrow cue. Kept intentionally quiet
 * so the Today dashboard and AI widget remain the primary focus.
 */
function JumpCard({
  to,
  icon: Icon,
  title,
  description,
  onPrefetch,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onPrefetch?: (to: string) => void;
}) {
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className={cn(
        "group pressable flex items-start gap-3 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-3.5 sm:rounded-xl sm:border-border sm:bg-card sm:px-4",
        "hover:border-primary/40 hover:bg-accent/40"
      )}
    >
      <div className="rounded-xl bg-muted/60 p-2.5 shrink-0 transition-colors group-hover:bg-primary/10 sm:rounded-md sm:p-2">
        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-60 transition-all sm:opacity-0 sm:group-hover:translate-x-0.5 sm:group-hover:opacity-100" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {description}
        </p>
      </div>
    </Link>
  );
}

/**
 * One stat card in the "Snabböversikt" strip. The three cards (reviews,
 * calendars, mail) share this exact frame; keeping it in one place also
 * gives them the same hover/press language and route prefetch as the
 * Today tiles above.
 */
function QuickOverviewCard({
  to,
  icon: Icon,
  iconClass,
  value,
  label,
  hint,
  onPrefetch,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  value: React.ReactNode;
  label: string;
  hint: string;
  onPrefetch?: (to: string) => void;
}) {
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className="group pressable block rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex items-center justify-between">
        <Icon className={cn("h-4 w-4", iconClass)} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={hint}>
        {hint}
      </p>
    </Link>
  );
}

function HomeCollapsibleSection({
  title,
  ariaLabel,
  defaultOpen = false,
  actions,
  children,
}: {
  title: string;
  ariaLabel?: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      aria-label={ariaLabel ?? title}
      className="overflow-hidden rounded-xl border border-border/60 bg-card/20"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden
          />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {open ? (
        <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function Index() {
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
  const storeAttentionCount =
    inventoryAlert != null ? inventoryAlert.lowStock + inventoryAlert.outOfStock : 0;

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
          ? `+${dueTodayTasks.length} idag`
          : `${openTasks.length - overdueTasks.length} fler öppna`;
      return {
        title: "Försenade uppgifter",
        value: overdueTasks.length,
        hint: dueTodayHint,
        tone: "warning" as const,
        to: "/tasks?view=overdue",
      };
    }
    if (dueTodayTasks.length > 0) {
      return {
        title: "Klart idag",
        value: dueTodayTasks.length,
        hint: `${openTasks.length - dueTodayTasks.length} fler öppna`,
        tone: "info" as const,
        to: "/tasks",
      };
    }
    if (openTasks.length > 0) {
      return {
        title: "Öppna uppgifter",
        value: openTasks.length,
        hint: `${tasks.length - openTasks.length} klara`,
        tone: "default" as const,
        to: "/tasks",
      };
    }
    return {
      title: "Öppna uppgifter",
      value: 0,
      hint: "Allt klart — bra jobbat.",
      tone: "success" as const,
      to: "/tasks",
    };
  }, [openTasks, overdueTasks, dueTodayTasks, tasks.length]);
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
      tiles.push({
        id: "health",
        urgency: 40,
        title: `Business health · ${health.label}`,
        value: health.score,
        hint: health.topReason ?? "Allt ser bra ut",
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
      title: "Olästa meddelanden",
      value: unreadDms,
      hint: unreadDms === 0 ? "Inkorgen är tom" : "Svar väntar under Meddelanden",
      icon: MessageSquare,
      to: "/messages",
      tone: unreadDms > 0 ? "info" : "default",
    });

    if (mode === "business") {
      tiles.push({
        id: "leads",
        urgency: 200 + leadsToFollowUp,
        title: "Leads att följa upp",
        value: leadsToFollowUp,
        hint: leadsToFollowUp === 0 ? "Pipelinen ser bra ut" : "Idag eller försenade",
        icon: UserPlus,
        to: "/sales?view=followups",
        tone: leadsToFollowUp > 0 ? "warning" : "default",
      });
    }

    if (reviewsNeedingReply > 0) {
      tiles.push({
        id: "reviews",
        urgency: 250 + reviewsNeedingReply,
        title: "Recensioner att svara på",
        value: reviewsNeedingReply,
        hint: "Kundfeedback väntar",
        icon: Star,
        to: "/reviews?filter=needs_reply",
        tone: "warning",
      });
    }

    if (mode === "business" && storeAttentionCount > 0) {
      tiles.push({
        id: "store",
        urgency: 150 + storeAttentionCount,
        title: "Butik behöver uppmärksamhet",
        value: storeAttentionCount,
        hint: inventoryAlert?.outOfStock
          ? `${inventoryAlert.outOfStock} slut i lager · kolla annonser och lager`
          : "Lågt lager — pausa annonser eller fyll på",
        icon: ShoppingBag,
        to: "/ecommerce",
        tone: "warning",
      });
    }

    tiles.push({
      id: "recs",
      urgency: 50 + activeRecs.length,
      title: "Aktiva AI-rekommendationer",
      value: activeRecs.length,
      hint:
        activeRecs.length === 0
          ? "Kör Generera under AI-rekommendationer"
          : "Granska och acceptera eller avfärda",
      icon: Sparkles,
      to: "/ai-recommendations",
      tone: activeRecs.length > 0 ? "info" : "default",
    });

    tiles.push({
      id: "connections",
      urgency: connectionIssues.length > 0 ? 80 + connectionIssues.length : 20,
      title: "Kopplingsproblem",
      value: connectionIssues.length,
      hint: connectionIssues.length === 0 ? "Allt fungerar" : "Återkoppla eller synka om",
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
    activeRecs.length,
    connectionIssues.length,
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
        (a) => a.platform === "google_reviews" || a.platform === "tripadvisor"
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
          label: "Snittbetyg",
          hint: totalReviews > 0 ? `${formatNumber(totalReviews)} recensioner` : "Inga recensioner än",
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
        label: calAccounts.length === 1 ? "Kalender" : "Kalendrar",
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
        label: mailAccounts.length === 1 ? "E-postkonto" : "E-postkonton",
        hint: mailAccounts.map((a) => (a.platform === "gmail" ? "Gmail" : "Outlook")).join(", "),
      });
    }

    return cards;
  }, [accounts, mode]);

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
        title={activeProfile?.name || "Startsida"}
        description={
          profileSummary.connectedCount > 0 ? (
            <>
              {profileSummary.connectedCount} kopplat
              {profileSummary.connectedCount === 1 ? " konto" : "a konton"}
              {profileSummary.platformText ? ` · ${profileSummary.platformText}` : ""}
            </>
          ) : (
            "Inga kopplingar än. Börja under Kopplingar."
          )
        }
      />

      {/* SmartDailyBrief owns the teaching — keep SmartBar live-only. */}
      <PageSmartBar
        title="Dagens läge"
        liveHintOverride={
          health.score < 100 && health.topReason
            ? `${health.label} (${health.score}/100) — ${health.topReason}`
            : health.score >= 100
              ? "Allt ser bra ut idag — inget brådskande i briefen."
              : profileSummary.connectedCount === 0
                ? "Inga kopplingar än — börja under Kopplingar."
                : null
        }
        extraActions={
          profileSummary.connectedCount === 0
            ? [{ label: "Öppna Kopplingar", to: "/connections" }]
            : []
        }
      />

      <PageModeTabs
        value={homeTab === "pulse" && !showPulseTab ? "today" : homeTab}
        aria-label="Startsida-flikar"
        onChange={setHomeTab}
        options={[
          { value: "today", label: "Idag" },
          ...(showPulseTab ? [{ value: "pulse" as const, label: "Marknadspuls" }] : []),
          { value: "more", label: "Mer" },
        ]}
      />

      {homeTab === "today" || (homeTab === "pulse" && !showPulseTab) ? (
      <>
      <SmartDailyBrief businessProfileId={homeBusinessProfileId} />

      {mode === "business" && isMobile ? (
        <ExperienceBoostCard
          profile={businessProfile}
          connectedCount={profileSummary.connectedCount}
          attentionCount={connectionIssues.length}
        />
      ) : null}

      <section aria-label="Idag" className="app-workspace-shell !min-h-0 space-y-3 p-3 sm:space-y-2 sm:p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-sm">Idag</h2>
          <Link
            to="/activity"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1 sm:text-xs"
          >
            <ActivityIcon className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            Aktivitet
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
          <HomeCollapsibleSection title="Fler idag" ariaLabel="Fler idag">
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
          title="Profildetaljer"
          ariaLabel="Profildetaljer"
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
                  aria-label={`Ta bort profil ${activeProfile.name}`}
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
                Profildata laddad från {profileSummary.withLoadedData} av{" "}
                {profileSummary.connectedCount} kopplat
                {profileSummary.connectedCount === 1 ? " konto" : "a konton"}.
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
                      <dt className="shrink-0 font-medium text-muted-foreground">Webb</dt>
                      <dd className="min-w-0 break-all">{activeProfile.website}</dd>
                    </div>
                  ) : null}
                  {activeProfile.email ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">E-post</dt>
                      <dd className="min-w-0 break-all">{activeProfile.email}</dd>
                    </div>
                  ) : null}
                  {activeProfile.phone ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">Telefon</dt>
                      <dd className="min-w-0">{activeProfile.phone}</dd>
                    </div>
                  ) : null}
                  {activeProfile.location ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="shrink-0 font-medium text-muted-foreground">Plats</dt>
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
        <HomeCollapsibleSection title="AI-förslag" ariaLabel="AI-förslag">
          <AiRecommendationsWidget businessProfileId={homeBusinessProfileId} />
        </HomeCollapsibleSection>
      ) : null}

      {quickOverviewCards.length > 0 ? (
        <HomeCollapsibleSection title="Snabböversikt" ariaLabel="Snabböversikt">
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

      <HomeCollapsibleSection title="Automationer som jobbar" ariaLabel="Automationer som jobbar">
        <FlowAutomationStatusCard businessProfileId={homeBusinessProfileId} />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection title="Gå till" ariaLabel="Gå till">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {homeJumpDestinations.map((dest) => (
            <JumpCard
              key={dest.key}
              to={dest.to}
              icon={dest.icon}
              title={dest.label}
              description={dest.description ?? dest.label}
              onPrefetch={prefetchFor}
            />
          ))}
        </div>
      </HomeCollapsibleSection>
      </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redigera profil</DialogTitle>
            <DialogDescription>
              Snabb redigering här — för guide om varje fält, gå till{" "}
              <Link to="/company" className="font-medium text-primary underline underline-offset-2">
                Företag
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-name">Profilnamn</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-company">Företag</Label>
              <Input
                id="profile-company"
                value={profileForm.company}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, company: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-location">Plats</Label>
              <Input
                id="profile-location"
                value={profileForm.location}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, location: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">E-post</Label>
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
              <Label htmlFor="profile-phone">Telefon</Label>
              <Input
                id="profile-phone"
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-website">Webbplats</Label>
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
              <Label htmlFor="profile-notes">Beskrivning av verksamheten</Label>
              <Textarea
                id="profile-notes"
                placeholder="Vad ni säljer, till vem och hur ni skiljer er — viktigast för AI i Sales och outreach."
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
              Avbryt
            </Button>
            <Button onClick={saveProfileEdits} disabled={!activeProfile}>
              Spara
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
              Ta bort profilen &quot;{activeProfile?.name || ""}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All analys från kopplade konton för denna profil tas bort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (activeProfile) removeProfile(activeProfile.id);
                setConfirmDeleteOpen(false);
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </m.div>
  );
}
