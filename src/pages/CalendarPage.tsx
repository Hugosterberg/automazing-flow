import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Clock,
  Zap,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  CalendarDays,
  Loader2,
  Pencil,
  Send,
} from "lucide-react";
import {
  format,
  isSameDay,
  parseISO,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfDay,
  isSameMonth,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { getOAuthProfileId } from "@/lib/oauthProfile";
import { apiUrl } from "@/lib/apiBase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useTasks, isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks";
import { useLeads, isLeadOpen, isFollowUpDueToday, isFollowUpOverdue } from "@/features/leads";
import { isoToLocalDateInputValue } from "@/lib/localDate";
import { useAccountData } from "@/hooks/useAccountData";
import type { ConnectedAccount } from "@/types/accounts";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { useProfileDocument } from "@/features/profile-documents";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { useScheduledPosts, SCHEDULED_POST_STATUS_LABELS, type ScheduledPost } from "@/features/social";
import { platformLabel } from "@/lib/platformLabels";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";

const STORAGE_KEY = "automazing-calendar-events";

function sortCalendarAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "google_calendar" ? 0 : p === "outlook_calendar" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

function readLegacyEvents(): CalendarEvent[] | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : undefined;
  } catch {
    return undefined;
  }
}

function writeLegacyEvents(events: CalendarEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

function sortByTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

function isExternalEvent(ev: CalendarEvent & { source?: string; readOnly?: boolean }): boolean {
  return ev.source === "external" || Boolean(ev.readOnly);
}

type ViewMode = "day" | "week" | "month";

/** Calendar row: a normal event, or a social post carried along for its dialog. */
type CalendarItem = CalendarEvent & { post?: ScheduledPost };

function localTimeOfIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type CalendarProviderData = {
  source?: string;
  events?: CalendarEvent[];
  calendars?: Array<{ id: string; name: string; primary?: boolean }>;
  note?: string;
} | null;

export default function CalendarPage() {
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const selectedAccountId = getSelectedAccountId("calendar");
  // Calendar events persist per business profile in the DB (synced across
  // devices), migrating any existing device-local events on first load.
  const eventsDoc = useProfileDocument<CalendarEvent[]>("calendar-events", [], {
    legacyRead: () => readLegacyEvents(),
    legacyWrite: (_bpId, value) => writeLegacyEvents(value),
  });
  const events = eventsDoc.data;
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "day" : "week"
  );
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAutomated, setFormAutomated] = useState(false);
  // Social-post reschedule dialog (scheduled posts from the publishing pipeline).
  const scheduledPosts = useScheduledPosts();
  const [postDialog, setPostDialog] = useState<ScheduledPost | null>(null);
  const [postFormDate, setPostFormDate] = useState("");
  const [postFormTime, setPostFormTime] = useState("");
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);

  const {
    activeAccount: activeCalendarAccount,
    data: providerData,
    loading: providerLoading,
    error: providerError,
    refresh: refreshProviderEvents,
  } = useAccountData<CalendarProviderData>({
    accounts,
    selectedAccountId,
    setSelectedAccountId: (id) => setSelectedAccountId("calendar", id),
    accountFilter: (a) =>
      (a.platform === "google_calendar" || a.platform === "outlook_calendar") && Boolean(a.isOAuth),
    initialData: null,
    requestKey: activeBusinessProfileId ?? activeProfileId,
    scopeSort: sortCalendarAccounts,
    fetcher: async (accountId) => {
      const res = await fetchWithTimeout(accountDataUrl(accountId, activeBusinessProfileId ?? activeProfileId), { credentials: "include" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(payload, "Could not fetch external calendar events."));
      }
      return res.json();
    },
  });

  const localEvents = useMemo(
    () =>
      events.map((e) => ({
        ...e,
        source: "local" as const,
      })),
    [events]
  );
  const externalEvents = useMemo(
    () =>
      (providerData?.events || []).map((e) => ({
        ...e,
        id: `ext_${e.id}`,
        source: "external" as const,
        readOnly: true,
      })),
    [providerData]
  );
  // Pipeline posts with a time appear as calendar items with platform badges.
  const socialEvents = useMemo<CalendarItem[]>(
    () =>
      scheduledPosts.posts
        .filter((p) => p.scheduledFor)
        .map((p) => ({
          id: `post_${p.id}`,
          title: p.caption.trim() || "Socialt inlägg",
          date: isoToLocalDateInputValue(p.scheduledFor as string),
          time: localTimeOfIso(p.scheduledFor as string),
          isAutomated: true,
          createdAt: p.createdAt,
          source: "social" as const,
          readOnly: true,
          post: p,
        })),
    [scheduledPosts.posts]
  );
  const allEvents = useMemo<CalendarItem[]>(
    () => [...localEvents, ...externalEvents, ...socialEvents],
    [localEvents, externalEvents, socialEvents]
  );

  const openPostDialog = (post: ScheduledPost) => {
    setPostDialog(post);
    if (post.scheduledFor) {
      setPostFormDate(isoToLocalDateInputValue(post.scheduledFor));
      setPostFormTime(localTimeOfIso(post.scheduledFor));
    } else {
      setPostFormDate(format(new Date(), "yyyy-MM-dd"));
      setPostFormTime("09:00");
    }
  };

  const savePostReschedule = () => {
    if (!postDialog || !postFormDate) return;
    const next = new Date(`${postFormDate}T${postFormTime || "09:00"}`);
    if (Number.isNaN(next.getTime())) return;
    scheduledPosts.reschedule(postDialog.id, next.toISOString());
    setPostDialog(null);
  };

  const businessProfileId = activeBusinessProfileId ?? activeProfileId ?? null;
  const { tasks } = useTasks(businessProfileId);
  const { leads } = useLeads(businessProfileId);

  const smartSuggestions = useMemo(() => {
    const nowMs = Date.now();
    const existingTitles = new Set(allEvents.map((e) => e.title.toLowerCase()));
    const out: Array<{ id: string; title: string; date: string; source: string }> = [];

    for (const task of tasks.filter(isTaskOpen)) {
      if (!isTaskDueToday(task, nowMs) && !isTaskOverdue(task, nowMs)) continue;
      const title = `Task: ${task.title}`;
      if (existingTitles.has(title.toLowerCase())) continue;
      out.push({
        id: `task-${task.id}`,
        title,
        date: task.due_at ? isoToLocalDateInputValue(task.due_at) : format(new Date(), "yyyy-MM-dd"),
        source: "task",
      });
    }
    for (const lead of leads.filter((l) => isLeadOpen(l.status))) {
      if (!isFollowUpDueToday(lead.nextFollowUpAt, nowMs) && !isFollowUpOverdue(lead.nextFollowUpAt, nowMs)) continue;
      const title = `Follow up: ${lead.company}`;
      if (existingTitles.has(title.toLowerCase())) continue;
      out.push({
        id: `lead-${lead.id}`,
        title,
        date: lead.nextFollowUpAt ? isoToLocalDateInputValue(lead.nextFollowUpAt) : format(new Date(), "yyyy-MM-dd"),
        source: "lead",
      });
    }
    return out.slice(0, 6);
  }, [allEvents, tasks, leads]);

  function addSuggestionToCalendar(suggestion: { title: string; date: string }) {
    eventsDoc.save([
      ...events,
      {
        id: crypto.randomUUID(),
        title: suggestion.title,
        date: suggestion.date,
        isAutomated: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  const eventsOnDate = (date: Date) =>
    allEvents.filter((e) => isSameDay(parseISO(e.date), date));

  const dayFocusDate = selectedDate ?? currentDate;
  const dayFocusEvents = useMemo(
    () =>
      sortByTime(
        allEvents.filter((e) => isSameDay(parseISO(e.date), dayFocusDate))
      ) as CalendarItem[],
    [allEvents, dayFocusDate]
  );

  const focusedEvent = useMemo(
    () => dayFocusEvents.find((event) => event.id === focusedEventId) ?? null,
    [dayFocusEvents, focusedEventId]
  );

  const navigateDayEventRelative = useCallback(
    (delta: 1 | -1) => {
      if (dayFocusEvents.length === 0) return;
      const currentIndex = focusedEventId
        ? dayFocusEvents.findIndex((event) => event.id === focusedEventId)
        : -1;
      const nextIndex =
        currentIndex < 0
          ? delta > 0
            ? 0
            : dayFocusEvents.length - 1
          : (currentIndex + delta + dayFocusEvents.length) % dayFocusEvents.length;
      setFocusedEventId(dayFocusEvents[nextIndex]?.id ?? null);
    },
    [dayFocusEvents, focusedEventId]
  );

  useEffect(() => {
    if (focusedEventId && !dayFocusEvents.some((event) => event.id === focusedEventId)) {
      setFocusedEventId(null);
    }
  }, [dayFocusEvents, focusedEventId]);

  useEffect(() => {
    if (!focusedEventId) return;
    document
      .querySelector(`[data-calendar-event-id="${focusedEventId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedEventId, dayFocusEvents.length, dayFocusDate]);

  const saveEvent = () => {
    if (!formTitle.trim() || !formDate) return;
    const payload = {
      title: formTitle.trim(),
      date: formDate,
      time: formTime.trim() || undefined,
      description: formDescription.trim() || undefined,
      isAutomated: formAutomated,
    };
    if (editingEventId) {
      eventsDoc.save(
        events.map((e) =>
          e.id === editingEventId
            ? { ...e, ...payload }
            : e
        )
      );
    } else {
      eventsDoc.save([
        ...events,
        {
          id: crypto.randomUUID(),
          ...payload,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    resetForm();
    setDialogOpen(false);
  };

  function resetForm() {
    setFormTitle("");
    setFormTime("");
    setFormDescription("");
    setFormAutomated(false);
    setEditingEventId(null);
    setFormDate(format(new Date(), "yyyy-MM-dd"));
  }

  const removeEvent = (id: string) => {
    eventsDoc.save(events.filter((e) => e.id !== id));
  };

  const openDialog = () => {
    setEditingEventId(null);
    setFormDate(selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    setFormTitle("");
    setFormTime("");
    setFormDescription("");
    setFormAutomated(false);
    setDialogOpen(true);
  };

  const openEditDialog = (ev: CalendarEvent) => {
    if (ev.readOnly || ev.source === "external") return;
    setEditingEventId(ev.id);
    setFormDate(ev.date);
    setFormTitle(ev.title);
    setFormTime(ev.time ?? "");
    setFormDescription(ev.description ?? "");
    setFormAutomated(ev.isAutomated);
    setDialogOpen(true);
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (dialogOpen || postDialog || isTypingTarget(e.target) || isShortcutBlocked()) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        navigateDayEventRelative(1);
        return;
      }

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        navigateDayEventRelative(-1);
        return;
      }

      if (matchesKey(e, "o") && isPlainLetterShortcut(e) && focusedEventId) {
        const event = dayFocusEvents.find((item) => item.id === focusedEventId);
        if (!event) return;
        e.preventDefault();
        if (event.source === "social" && event.post) {
          openPostDialog(event.post);
        } else if (!event.readOnly) {
          openEditDialog(event);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, postDialog, navigateDayEventRelative, focusedEventId, dayFocusEvents]);

  const navPrev = () => {
    if (viewMode === "day") setCurrentDate((d) => addDays(d, -1));
    else if (viewMode === "week") setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subMonths(d, 1));
  };

  const navNext = () => {
    if (viewMode === "day") setCurrentDate((d) => addDays(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addMonths(d, 1));
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const navTitle =
    viewMode === "day"
      ? format(currentDate, "EEEE d MMMM", { locale: enUS })
      : viewMode === "week"
        ? `${format(weekStart, "d MMM", { locale: enUS })} – ${format(weekEnd, "d MMM", { locale: enUS })}`
        : format(currentDate, "MMMM yyyy", { locale: enUS });

  const datesWithEvents = [...new Set(allEvents.map((e) => e.date))].map((d) =>
    parseISO(d)
  );

  const upcomingEvents = allEvents
    .filter((e) => parseISO(e.date) >= startOfDay(new Date()))
    .sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      return dc !== 0 ? dc : (a.time || "").localeCompare(b.time || "");
    })
    .slice(0, 8);

  function connectCalendar(
    platform: "google_calendar" | "outlook_calendar",
    provider: "auto" | "zernio" | "official"
  ) {
    const params = new URLSearchParams();
    params.set("app_origin", window.location.origin);
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    if (activeBusinessProfileId) params.set("business_profile_id", activeBusinessProfileId);
    if (provider !== "auto") params.set("provider", provider);
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `${apiUrl(`/api/auth/${platform}`)}${query}`;
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <PageHeader
        icon={CalendarDays}
        title="Kalender"
        description="Planera och schemalägg händelser från uppgifter, leads och kopplade kalendrar."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => connectCalendar("google_calendar", "auto")}
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Koppla Google Kalender
            </Button>
            <Button onClick={openDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till
            </Button>
          </>
        }
      />

      <PageSmartBar
        title="Kalendern samlar uppgifter, lead-uppföljningar och externa kalendrar — så du ser veckan i ett flöde."
        steps={[
          "Koppla Google eller Outlook-kalender för synk",
          "Växla dag/vecka/månad och klicka en dag för detaljer",
          "Skapa egna händelser eller följ upp från Tasks och Sales",
        ]}
        tip="Uppgifter och leads med datum syns automatiskt i vyn."
        liveHintOverride={
          smartSuggestions.length > 0
            ? `${smartSuggestions.length} uppgift${smartSuggestions.length === 1 ? "" : "er"} eller lead${smartSuggestions.length === 1 ? "" : "s"} förfaller idag — lägg till i kalendern`
            : null
        }
      />

      <SectionConnectionStatus area="calendar" className="mt-0" />

      {oauthErrorDetails && (
        <OAuthErrorAlert
          details={oauthErrorDetails}
          message={formatOAuthErrorMessage(
            oauthErrorDetails,
            {
              google_calendar_not_configured: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
              outlook_calendar_not_configured: "Outlook Calendar is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.",
            },
            "Calendar connect failed"
          )}
          onDismiss={clearOauthError}
        />
      )}
      {providerError && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <p className="text-sm text-destructive">{providerError}</p>
            <Button variant="ghost" size="sm" onClick={() => void refreshProviderEvents()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
      {providerData?.note && (
        <Card className="bg-muted/40 border-border">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-muted-foreground">{providerData.note}</p>
          </CardContent>
        </Card>
      )}

      <div className="app-workspace-shell !min-h-[min(72vh,820px)]">
        <div className="app-workspace-stats grid grid-cols-3 gap-2 px-3 py-2 sm:px-4">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Händelser</p>
            <p className="text-xs font-semibold tabular-nums">{allEvents.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Kommande</p>
            <p className="text-xs font-semibold tabular-nums">{upcomingEvents.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Kalendrar</p>
            <p className="text-xs font-semibold tabular-nums">
              {accounts.filter((a) => (a.platform === "google_calendar" || a.platform === "outlook_calendar") && a.isOAuth).length}
            </p>
          </div>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] gap-6 items-start p-3 sm:p-4 min-h-0 flex-1 overflow-y-auto">
        <Card className="rounded-xl shrink-0 w-full lg:mx-0 mx-auto">
          <CardContent className="pt-6">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                setSelectedDate(d);
                if (d) setCurrentDate(d);
              }}
              locale={enUS}
              modifiers={{ hasEvents: datesWithEvents }}
              modifiersClassNames={{
                hasEvents: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
              }}
            />
            <div className="flex gap-1 mt-4 rounded-lg border border-border/50 p-0.5 bg-muted/30">
              {(["day", "week", "month"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={cn(
                    "flex-1 py-2 text-xs font-medium rounded-md transition-colors",
                    viewMode === m
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "day" && "Day"}
                  {m === "week" && "Week"}
                  {m === "month" && "Month"}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Connect calendars</p>
              <div className="grid grid-cols-1 gap-1">
                <Button variant="outline" size="sm" onClick={() => connectCalendar("google_calendar", "zernio")} className="justify-start">
                  <Layers className="h-3.5 w-3.5 mr-2" />
                  Google Calendar via Zernio
                </Button>
                <Button variant="outline" size="sm" onClick={() => connectCalendar("google_calendar", "official")} className="justify-start">
                  <CalendarDays className="h-3.5 w-3.5 mr-2" />
                  Google Calendar via Official API
                </Button>
                <Button variant="outline" size="sm" onClick={() => connectCalendar("outlook_calendar", "zernio")} className="justify-start">
                  <Layers className="h-3.5 w-3.5 mr-2" />
                  Outlook Calendar via Zernio
                </Button>
                <Button variant="outline" size="sm" onClick={() => connectCalendar("outlook_calendar", "official")} className="justify-start">
                  <CalendarDays className="h-3.5 w-3.5 mr-2" />
                  Outlook Calendar via Official API
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium capitalize truncate px-2 max-w-[160px]">
                {navTitle}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {activeCalendarAccount && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-xs"
                onClick={() => void refreshProviderEvents()}
                disabled={providerLoading}
              >
                {providerLoading ? "Refreshing..." : "Refresh connected calendar"}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl min-h-[400px] flex flex-col w-full">
          <CardContent className="flex-1 p-6 overflow-auto">
            {providerLoading && activeCalendarAccount ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading connected calendar events…
              </div>
            ) : null}
            {viewMode === "day" && (
              <div className="max-w-md">
                <h2 className="text-lg font-semibold mb-4">
                  {format(currentDate, "EEEE d MMMM", { locale: enUS })}
                </h2>
                {eventsOnDate(currentDate).length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8">
                    No activities on this day. Click &quot;Add&quot; to create one.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {sortByTime(eventsOnDate(currentDate)).map((ev: CalendarItem) => (
                      <li
                        key={ev.id}
                        data-calendar-event-id={ev.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted group",
                          ev.source === "social" && "cursor-pointer",
                          focusedEventId === ev.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                        onClick={ev.source === "social" && ev.post ? () => openPostDialog(ev.post as ScheduledPost) : undefined}
                      >
                        {ev.source === "social" ? (
                          <Send className="h-4 w-4 text-primary shrink-0" />
                        ) : ev.isAutomated ? (
                          <Zap className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{ev.title}</p>
                          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                            {ev.time ? <span>{ev.time}</span> : null}
                            {ev.source === "social" && ev.post ? (
                              <>
                                {ev.post.platforms.map((p) => (
                                  <span key={p} className="rounded bg-primary/10 text-primary px-1 py-0.5 text-[10px] uppercase tracking-wide">
                                    {platformLabel(p)}
                                  </span>
                                ))}
                                <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                                  {SCHEDULED_POST_STATUS_LABELS[ev.post.status]}
                                </span>
                              </>
                            ) : isExternalEvent(ev) ? (
                              <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                                External
                              </span>
                            ) : null}
                          </p>
                        </div>
                        {!ev.readOnly && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditDialog(ev)}
                              aria-label="Edit event"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeEvent(ev.id)}
                              aria-label="Delete event"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {viewMode === "week" && (
              <div className="-mx-1 overflow-x-auto app-scroll px-1 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="grid min-w-[640px] grid-cols-7 gap-2 sm:min-w-0">
                {weekDays.map((day) => {
                  const dayEvents = eventsOnDate(day);
                  const today = isSameDay(day, new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "rounded-lg border p-2 min-h-[120px]",
                        today ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20"
                      )}
                    >
                      <div className="text-center mb-2">
                        <p className="text-[11px] uppercase text-muted-foreground">
                          {format(day, "EEE", { locale: enUS })}
                        </p>
                        <p className="text-sm font-semibold">{format(day, "d")}</p>
                      </div>
                      <ul className="space-y-1">
                        {sortByTime(dayEvents).map((ev: CalendarItem) => (
                          <li
                            key={ev.id}
                            data-calendar-event-id={ev.id}
                            className={cn(
                              "group flex items-center gap-1 rounded px-1.5 py-1 bg-background/80 hover:bg-muted text-xs",
                              ev.source === "social" && "cursor-pointer",
                              focusedEventId === ev.id && "ring-1 ring-primary"
                            )}
                            onClick={ev.source === "social" && ev.post ? () => openPostDialog(ev.post as ScheduledPost) : undefined}
                          >
                            {ev.source === "social" ? (
                              <Send className="h-3 w-3 text-primary shrink-0" />
                            ) : ev.isAutomated ? (
                              <Zap className="h-3 w-3 text-primary shrink-0" />
                            ) : (
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="truncate flex-1">{ev.title}</span>
                            {ev.source === "social" && ev.post ? (
                              <span className="shrink-0 text-[9px] uppercase text-primary">
                                {ev.post.platforms.length > 0 ? platformLabel(ev.post.platforms[0]) : "Post"}
                                {ev.post.platforms.length > 1 ? ` +${ev.post.platforms.length - 1}` : ""}
                              </span>
                            ) : isExternalEvent(ev) ? (
                              <span className="shrink-0 text-[9px] uppercase text-muted-foreground">Ext</span>
                            ) : null}
                            {!ev.readOnly && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeEvent(ev.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              </div>
            )}

            {viewMode === "month" && (
              <div className="-mx-1 overflow-x-auto app-scroll px-1 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="grid min-w-[560px] grid-cols-7 gap-1 sm:min-w-0">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
                {monthDays.map((day) => {
                  const dayEvents = eventsOnDate(day);
                  const today = isSameDay(day, new Date());
                  const inMonth = isSameMonth(day, currentDate);
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[80px] rounded-lg border p-2 relative flex items-center justify-center",
                        inMonth ? "border-border/50" : "border-transparent opacity-50",
                        today && "ring-1 ring-primary/30 bg-primary/5"
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                          today && "bg-primary text-primary-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <span
                              key={ev.id}
                              className="h-1 w-1 rounded-full bg-primary"
                              title={ev.title}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dayFocusEvents.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4">
          <span className="truncate">
            {focusedEvent ? (
              <>
                Fokus:{" "}
                <span className="font-medium text-foreground/80">{focusedEvent.title}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {format(dayFocusDate, "d MMM", { locale: enUS })}
                </span>
              </>
            ) : (
              `J/K bläddra händelser ${format(dayFocusDate, "d MMM", { locale: enUS })}`
            )}
          </span>
          <span className="hidden sm:inline">O Open</span>
        </div>
      ) : null}

      {smartSuggestions.length > 0 && (
        <Card className="rounded-xl border-dashed">
          <CardContent className="py-4 space-y-3">
            <h2 className="text-sm font-semibold">Suggested for your calendar</h2>
            <p className="text-xs text-muted-foreground">
              Pulled automatically from tasks and lead follow-ups due today or overdue.
            </p>
            <div className="flex flex-wrap gap-2">
              {smartSuggestions.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto py-1.5 text-xs"
                  onClick={() => addSuggestionToCalendar(s)}
                >
                  + {s.title}
                  <span className="ml-1.5 text-muted-foreground tabular-nums">{s.date}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {upcomingEvents.length > 0 && (
        <Card className="rounded-xl">
          <CardContent className="py-4">
            <h2 className="text-sm font-semibold mb-3">Upcoming events</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {upcomingEvents.map((ev: CalendarItem) => (
                <div
                  key={ev.id}
                  className={cn(
                    "shrink-0 w-44 p-3 rounded-lg border border-border/50 bg-muted/20",
                    ev.source === "social" && "cursor-pointer hover:bg-muted/40"
                  )}
                  onClick={ev.source === "social" && ev.post ? () => openPostDialog(ev.post as ScheduledPost) : undefined}
                >
                  <p className="font-medium text-sm truncate">{ev.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>
                      {format(parseISO(ev.date), "EEE d MMM", { locale: enUS })}
                      {ev.time && ` · ${ev.time}`}
                    </span>
                    {ev.source === "social" && ev.post ? (
                      <span className="rounded bg-primary/10 text-primary px-1 py-0.5 text-[10px] uppercase tracking-wide">
                        {ev.post.platforms.length > 0 ? platformLabel(ev.post.platforms[0]) : "Post"}
                      </span>
                    ) : isExternalEvent(ev) ? (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                        External
                      </span>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>{editingEventId ? "Edit activity" : "Add activity"}</DialogTitle>
            <DialogDescription>
              {editingEventId ? "Update this calendar entry." : "Add an activity or automated task to the calendar"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cal-date">Date</Label>
              <Input
                id="cal-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-title">Title</Label>
              <Input
                id="cal-title"
                placeholder="E.g. Team meeting, Scheduled post"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-time">Time (optional)</Label>
              <Input
                id="cal-time"
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-description">Description (optional)</Label>
              <Textarea
                id="cal-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                placeholder="Notes or agenda"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="cal-auto" className="font-medium">
                  Automated task
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Runs automatically at the specified time
                </p>
              </div>
              <Switch
                id="cal-auto"
                checked={formAutomated}
                onCheckedChange={setFormAutomated}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEvent} disabled={!formTitle.trim()}>
              {editingEventId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={postDialog != null} onOpenChange={(open) => { if (!open) setPostDialog(null); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Scheduled post</DialogTitle>
            <DialogDescription>
              {postDialog
                ? postDialog.status === "published"
                  ? "This post is already published."
                  : "Move the publish time, or open the post in the composer to edit it."
                : ""}
            </DialogDescription>
          </DialogHeader>
          {postDialog ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-sm whitespace-pre-line line-clamp-5">{postDialog.caption || "(tomt inlägg)"}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {postDialog.platforms.map((p) => (
                    <span key={p} className="rounded bg-primary/10 text-primary px-1 py-0.5 text-[10px] uppercase tracking-wide">
                      {platformLabel(p)}
                    </span>
                  ))}
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                    {SCHEDULED_POST_STATUS_LABELS[postDialog.status]}
                  </span>
                  {postDialog.error ? <span className="text-destructive">{postDialog.error}</span> : null}
                </p>
              </div>
              {postDialog.status !== "published" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="post-date">Date</Label>
                    <Input id="post-date" type="date" value={postFormDate} onChange={(e) => setPostFormDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post-time">Time</Label>
                    <Input id="post-time" type="time" value={postFormTime} onChange={(e) => setPostFormTime(e.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {postDialog ? (
              <Button variant="outline" asChild>
                <Link to={`/social-media?post=${postDialog.id}`}>Open in composer</Link>
              </Button>
            ) : null}
            {postDialog && postDialog.status !== "published" ? (
              <Button onClick={savePostReschedule} disabled={!postFormDate}>
                Save new time
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
