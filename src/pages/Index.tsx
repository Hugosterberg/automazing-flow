import { m } from "framer-motion";
import {
  Trash2,
  Pencil,
  FolderOpen,
  PlugZap,
  Share2,
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
import { Link } from "react-router-dom";
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
import { useMarketingCampaigns } from "@/features/marketing";

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
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className={cn(
        "group block rounded-xl border border-border bg-card px-4 py-4 transition-colors",
        "hover:border-primary/40 hover:bg-accent/40"
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className={cn("h-4 w-4", toneAccent)} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="text-sm font-medium text-muted-foreground mt-1 sm:mt-0.5 sm:text-xs">{title}</p>
      {hint ? (
        <p className="text-xs text-muted-foreground/80 mt-1.5 sm:mt-1 sm:text-[11px]">{hint}</p>
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
        "group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors",
        "hover:border-primary/40 hover:bg-accent/40"
      )}
    >
      <div className="rounded-md bg-muted/60 p-2 shrink-0 group-hover:bg-primary/10 transition-colors">
        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate">
            {title}
          </p>
          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {description}
        </p>
      </div>
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

      {!isMobile ? (
      <PageSmartBar
        title="Startsidan är din dagliga överblick — vad som behöver göras och var du ska gå härnäst."
        steps={[
          "Läs dagens brief och kolla Idag-rutorna",
          "Fyll i Företag och koppla konton för bättre AI",
          "Öppna Automationer för jobb som kan köra sig själva",
        ]}
        tip="Synk-färskhet visas ovanför Idag — grönt betyder att data nyligen hämtats."
        liveHintOverride={
          health.score < 100 && health.topReason
            ? `${health.label} (${health.score}/100) — ${health.topReason}`
            : health.score >= 100
              ? "Allt ser bra ut idag — inget brådskande i briefen."
              : null
        }
      />
      ) : (
        <div className="space-y-2">
          {health.score < 100 && health.topReason ? (
            <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm leading-relaxed text-foreground/90">
              {health.label} · {health.topReason}
            </p>
          ) : null}
          <PageSmartBar
            title="Fyll i det viktiga först — sedan sköter automationer mer av jobbet."
            steps={[
              "Beskrivning + webb under Företag",
              "Koppla mail och sociala konton",
              "Titta under Automationer vad som kan köras automatiskt",
            ]}
            tip="AI blir bättre ju mer profil och kopplingar du fyller i — utkast och förslag blir mer relevanta."
            smart={false}
          />
        </div>
      )}

      <SmartDailyBrief businessProfileId={homeBusinessProfileId} />

      {profiles.length > 2 ? <ProfileList /> : null}

      {mode === "business" && !isMobile ? <CompanyProfileNudge profile={businessProfile} /> : null}

      {mode === "business" && isMobile ? (
        <ExperienceBoostCard
          profile={businessProfile}
          connectedCount={profileSummary.connectedCount}
        />
      ) : null}

      {mode === "business" ? (
        isMobile ? (
          <HomeCollapsibleSection title="Marknadspuls" ariaLabel="Marknadspuls">
            <MarketPulseCard businessProfileId={homeBusinessProfileId} />
          </HomeCollapsibleSection>
        ) : (
          <MarketPulseCard businessProfileId={homeBusinessProfileId} />
        )
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
            "grid grid-cols-1 gap-3",
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
            <div className="grid grid-cols-1 gap-3">
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

      {/* Quick overview widgets */}
      {accounts.length > 0 && (
        <HomeCollapsibleSection title="Snabböversikt" ariaLabel="Snabböversikt">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Reviews widget — business-only (the Reviews page is fenced off in Private) */}
            {(() => {
              if (mode === "private") return null;
              const reviewAccounts = accounts.filter(
                (a) => a.platform === "google_reviews" || a.platform === "tripadvisor"
              );
              if (reviewAccounts.length === 0) return null;
              const avgRating = reviewAccounts
                .map((a) => a.stats?.averageRating)
                .filter((r): r is number => typeof r === "number")
                .reduce((sum, r, _, arr) => sum + r / arr.length, 0);
              const totalReviews = reviewAccounts
                .map((a) => a.stats?.reviewCount ?? 0)
                .reduce((s, n) => s + n, 0);
              return (
                <Link
                  to="/reviews"
                  className="group block rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">
                    {avgRating > 0 ? avgRating.toFixed(1) : "–"}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">Snittbetyg</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {totalReviews > 0 ? `${totalReviews} recensioner` : "Inga recensioner än"}
                  </p>
                </Link>
              );
            })()}

            {/* Calendar widget */}
            {(() => {
              const calAccounts = accounts.filter(
                (a) => a.platform === "google_calendar" || a.platform === "outlook_calendar"
              );
              if (calAccounts.length === 0) return null;
              return (
                <Link
                  to="/calendar"
                  className="group block rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <CalendarDays className="h-4 w-4 text-blue-500" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">{calAccounts.length}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    {calAccounts.length === 1 ? "Kalender" : "Kalendrar"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {calAccounts.map((a) => a.username).join(", ")}
                  </p>
                </Link>
              );
            })()}

            {/* Messages widget */}
            {(() => {
              const mailAccounts = accounts.filter(
                (a) => a.platform === "gmail" || a.platform === "outlook"
              );
              if (mailAccounts.length === 0) return null;
              return (
                <Link
                  to="/messages"
                  className="group block rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">{mailAccounts.length}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    {mailAccounts.length === 1 ? "E-postkonto" : "E-postkonton"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {mailAccounts.map((a) => a.platform === "gmail" ? "Gmail" : "Outlook").join(", ")}
                  </p>
                </Link>
              );
            })()}
          </div>
        </HomeCollapsibleSection>
      )}

      <HomeCollapsibleSection title="Gå till" ariaLabel="Gå till">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <JumpCard
            to="/connections"
            icon={PlugZap}
            title="Kopplingar"
            description="Kopplade konton, status och omautentisering"
            onPrefetch={prefetchFor}
          />
          <JumpCard
            to="/social-media"
            icon={Share2}
            title="Social & analys"
            description="Inlägg, statistik och överblick"
            onPrefetch={prefetchFor}
          />
          <JumpCard
            to="/content"
            icon={FolderOpen}
            title="Innehållsbibliotek"
            description="Drive-assets och skapa-flöde"
            onPrefetch={prefetchFor}
          />
        </div>
      </HomeCollapsibleSection>

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
