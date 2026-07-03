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
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { ProfileList } from "@/components/ProfileList";
import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useWorkspaceMode } from "@/features/workspace-mode";
import { useConnections } from "@/features/connections/useConnections";
import { AiRecommendationsWidget } from "@/features/ai-recommendations";
import { SmartDailyBrief } from "@/features/daily-brief";
import { useUnreadDmCount } from "@/features/daily-brief/useUnreadDmCount";
import { MarketPulseCard } from "@/features/intelligence";
import { useAiRecommendations } from "@/features/ai-recommendations";
import {
  useTasks,
  isTaskOpen,
  isTaskOverdue,
  isTaskDueToday,
} from "@/features/tasks";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { computeBusinessHealth } from "@/lib/businessHealth";

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
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{title}</p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground/80 mt-1">{hint}</p>
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

export default function Index() {
  const { activeProfile, profiles, accounts, removeProfile, updateProfile, activeProfileId } =
    useAccounts();
  const activeBpId = useActiveBusinessProfileIdOptional();
  const homeBusinessProfileId = activeBpId ?? activeProfileId ?? null;
  const { mode } = useWorkspaceMode();
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
          ? `+${dueTodayTasks.length} due today`
          : `${openTasks.length - overdueTasks.length} more open`;
      return {
        title: "Overdue tasks",
        value: overdueTasks.length,
        hint: dueTodayHint,
        tone: "warning" as const,
        to: "/tasks?view=overdue",
      };
    }
    if (dueTodayTasks.length > 0) {
      return {
        title: "Due today",
        value: dueTodayTasks.length,
        hint: `${openTasks.length - dueTodayTasks.length} more open`,
        tone: "info" as const,
        to: "/tasks",
      };
    }
    if (openTasks.length > 0) {
      return {
        title: "Open tasks",
        value: openTasks.length,
        hint: `${tasks.length - openTasks.length} completed`,
        tone: "default" as const,
        to: "/tasks",
      };
    }
    return {
      title: "Open tasks",
      value: 0,
      hint: "All tasks done — nice.",
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
      }),
    [connectionIssues.length, overdueTasks.length, dueTodayTasks.length, activeRecs.length]
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
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Home
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {activeProfile?.name || "Active profile"}
        </h1>
        {profileSummary.connectedCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {profileSummary.connectedCount} connected account
            {profileSummary.connectedCount === 1 ? "" : "s"}
            {profileSummary.platformText ? ` · ${profileSummary.platformText}` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No integrations connected yet. Start on the Connections page.
          </p>
        )}
      </header>

      <ProfileList />

      <SmartDailyBrief businessProfileId={homeBusinessProfileId} />

      {/* Crypto/market sentiment via the tenant's LunarCrush MCP account.
          Business-only and self-hiding when no provider is connected. */}
      {mode === "business" ? <MarketPulseCard businessProfileId={homeBusinessProfileId} /> : null}

      <section aria-label="Today" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Today</h2>
          <Link
            to="/activity"
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
          >
            <ActivityIcon className="h-3 w-3" />
            Activity feed
          </Link>
        </div>
        <div
          className={cn(
            "grid grid-cols-1 gap-3",
            mode === "business" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"
          )}
        >
          {mode === "business" ? (
            <TodayTile
              title={`Business health · ${health.label}`}
              value={health.score}
              hint={health.topReason ?? "Everything looks good"}
              icon={HeartPulse}
              to="/activity"
              tone={health.tone}
              onPrefetch={prefetchFor}
            />
          ) : null}
          <TodayTile
            title={tasksTile.title}
            value={tasksTile.value}
            hint={tasksTile.hint}
            icon={ListChecks}
            to={tasksTile.to}
            tone={tasksTile.tone}
            onPrefetch={prefetchFor}
          />
          <TodayTile
            title="Unread messages"
            value={unreadDms}
            hint={unreadDms === 0 ? "Inbox is clear" : "Replies waiting in Messages"}
            icon={MessageSquare}
            to="/messages"
            tone={unreadDms > 0 ? "info" : "default"}
            onPrefetch={prefetchFor}
          />
          <TodayTile
            title="Active AI recommendations"
            value={activeRecs.length}
            hint={
              activeRecs.length === 0
                ? "Run Generate on /ai-recommendations"
                : "Review and accept or dismiss"
            }
            icon={Sparkles}
            to="/ai-recommendations"
            tone={activeRecs.length > 0 ? "info" : "default"}
            onPrefetch={prefetchFor}
          />
          <TodayTile
            title="Connection issues"
            value={connectionIssues.length}
            hint={
              connectionIssues.length === 0
                ? "All healthy"
                : "Reconnect or resync needed"
            }
            icon={AlertTriangle}
            to="/connections"
            tone={connectionIssues.length > 0 ? "warning" : "success"}
            onPrefetch={prefetchFor}
          />
        </div>
      </section>

      {activeProfile ? (
        <section aria-label="Active profile" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Profile details
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors"
                aria-label={`Edit profile ${activeProfile.name}`}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              {profiles.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                  aria-label={`Delete profile ${activeProfile.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Loaded profile data from {profileSummary.withLoadedData} of{" "}
                {profileSummary.connectedCount} account
                {profileSummary.connectedCount === 1 ? "" : "s"}.
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
                <p className="text-xs text-muted-foreground/80 border-t border-border/70 pt-2">
                  {activeProfile.website ? `Website: ${activeProfile.website}` : ""}
                  {activeProfile.website &&
                  (activeProfile.email ||
                    activeProfile.phone ||
                    activeProfile.location)
                    ? " · "
                    : ""}
                  {activeProfile.email ? `Email: ${activeProfile.email}` : ""}
                  {activeProfile.email &&
                  (activeProfile.phone || activeProfile.location)
                    ? " · "
                    : ""}
                  {activeProfile.phone ? `Phone: ${activeProfile.phone}` : ""}
                  {activeProfile.phone && activeProfile.location ? " · " : ""}
                  {activeProfile.location ? `Location: ${activeProfile.location}` : ""}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {homeBusinessProfileId ? (
        <AiRecommendationsWidget businessProfileId={homeBusinessProfileId} />
      ) : null}

      {/* Quick overview widgets */}
      {accounts.length > 0 && (
        <section aria-label="Snabböversikt" className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Snabböversikt</h2>
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
        </section>
      )}

      <section aria-label="Jump to" className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Jump to</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <JumpCard
            to="/connections"
            icon={PlugZap}
            title="Connections"
            description="Linked accounts, health and re-auth"
            onPrefetch={prefetchFor}
          />
          <JumpCard
            to="/social-media"
            icon={Share2}
            title="Social & analytics"
            description="Posts, metrics and overview"
            onPrefetch={prefetchFor}
          />
          <JumpCard
            to="/content"
            icon={FolderOpen}
            title="Content library"
            description="Drive assets and creation flow"
            onPrefetch={prefetchFor}
          />
        </div>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update profile details used for planning and account context.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-name">Profile name</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-company">Company</Label>
              <Input
                id="profile-company"
                value={profileForm.company}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, company: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-location">Location</Label>
              <Input
                id="profile-location"
                value={profileForm.location}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, location: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
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
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-website">Website</Label>
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
              <Label htmlFor="profile-notes">Notes</Label>
              <Input
                id="profile-notes"
                placeholder="Short profile notes"
                value={profileForm.notes}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveProfileEdits} disabled={!activeProfile}>
              Save
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
              You want to delete profile &quot;{activeProfile?.name || ""}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It means the analysis of all connected accounts will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (activeProfile) removeProfile(activeProfile.id);
                setConfirmDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </m.div>
  );
}
