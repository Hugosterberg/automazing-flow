import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
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
  startOfDay,
} from "date-fns";
import { sv } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEvent } from "@/types/calendar";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { ValueSellEmpty } from "@/components/ValueSellEmpty";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { AutomationEnableHint } from "@/features/automation";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useTasks, isTaskOpen, isTaskOverdue, isTaskDueToday } from "@/features/tasks";
import { useLeads, isLeadOpen, isFollowUpDueToday, isFollowUpOverdue } from "@/features/leads";
import { isoToLocalDateInputValue } from "@/lib/localDate";
import { useAccountData } from "@/hooks/useAccountData";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { useProfileDocument } from "@/features/profile-documents";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { useScheduledPosts, type ScheduledPost } from "@/features/social";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import {
  sortCalendarAccounts,
  readLegacyEvents,
  writeLegacyEvents,
  sortByTime,
  localTimeOfIso,
} from "@/features/calendar/calendarHelpers";
import {
  CalendarUpcomingStrip,
  type CalendarUpcomingItem,
} from "@/features/calendar/CalendarUpcomingStrip";
import {
  CalendarViews,
  type CalendarViewMode,
} from "@/features/calendar/CalendarViews";
import {
  CalendarEventDialog,
  type CalendarEventFormValues,
} from "@/features/calendar/CalendarEventDialog";
import { ScheduledPostDialog } from "@/features/calendar/ScheduledPostDialog";

type ViewMode = CalendarViewMode;

/** Calendar row: a normal event, or a social post carried along for its dialog. */
type CalendarItem = CalendarUpcomingItem;

type CalendarProviderData = {
  source?: string;
  events?: CalendarEvent[];
  calendars?: Array<{ id: string; name: string; primary?: boolean }>;
  note?: string;
} | null;

const emptyEventForm = (): CalendarEventFormValues => ({
  title: "",
  date: format(new Date(), "yyyy-MM-dd"),
  time: "",
  description: "",
  isAutomated: false,
});

export default function CalendarPage() {
  const { t } = useTranslation("pages");
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const selectedAccountId = getSelectedAccountId("calendar");
  const hasCalendarConnected = useMemo(
    () =>
      accounts.some(
        (a) =>
          (a.platform === "google_calendar" || a.platform === "outlook_calendar") && Boolean(a.isOAuth)
      ),
    [accounts]
  );
  // Calendar events persist per business profile in the DB (synced across
  // devices), migrating any existing device-local events on first load.
  const eventsDoc = useProfileDocument<CalendarEvent[]>("calendar-events", [], {
    legacyRead: () => readLegacyEvents(),
    legacyWrite: (_bpId, value) => writeLegacyEvents(value),
  });
  const events = eventsDoc.data;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  const viewMode: ViewMode =
    rawView === "day" || rawView === "week" || rawView === "month"
      ? rawView
      : typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
        ? "day"
        : "week";
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const defaultMode =
            typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
              ? "day"
              : "week";
          if (mode === defaultMode) next.delete("view");
          else next.set("view", mode);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<CalendarEventFormValues>(emptyEventForm);
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
        throw new Error(apiErrorMessage(payload, "Kunde inte hämta händelser från den kopplade kalendern."));
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
    if (!eventForm.title.trim() || !eventForm.date) return;
    const payload = {
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: eventForm.time.trim() || undefined,
      description: eventForm.description.trim() || undefined,
      isAutomated: eventForm.isAutomated,
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
    setEventForm(emptyEventForm());
    setEditingEventId(null);
  }

  const removeEvent = (id: string) => {
    eventsDoc.save(events.filter((e) => e.id !== id));
  };

  const openDialog = () => {
    setEditingEventId(null);
    setEventForm({
      ...emptyEventForm(),
      date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (ev: CalendarEvent) => {
    if (ev.readOnly || ev.source === "external") return;
    setEditingEventId(ev.id);
    setEventForm({
      title: ev.title,
      date: ev.date,
      time: ev.time ?? "",
      description: ev.description ?? "",
      isAutomated: ev.isAutomated,
    });
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

  const navTitle =
    viewMode === "day"
      ? format(currentDate, "EEEE d MMMM", { locale: sv })
      : viewMode === "week"
        ? `${format(weekStart, "d MMM", { locale: sv })} – ${format(weekEnd, "d MMM", { locale: sv })}`
        : format(currentDate, "MMMM yyyy", { locale: sv });

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

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <PageHeader
        icon={CalendarDays}
        title={t("calendar.title")}
        description={t("calendar.description")}
        actions={
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        }
      />

      <PageSmartBar
        title={t("calendar.smartBar")}
        steps={[
          "Koppla Google eller Outlook-kalender för synk",
          "Växla dag/vecka/månad och öppna en dag för detaljer",
          "Skapa egna händelser eller följ upp från Uppgifter och Sales",
        ]}
        tip="Uppgifter och leads med datum syns automatiskt i vyn."
        liveHintOverride={
          smartSuggestions.length > 0
            ? `${smartSuggestions.length} uppgift${smartSuggestions.length === 1 ? "" : "er"} eller lead${smartSuggestions.length === 1 ? "" : "s"} förfaller idag — lägg till i kalendern`
            : null
        }
      />

      <SectionConnectionStatus area="calendar" className="mt-0" hideWhenHealthy />

      {!hasCalendarConnected ? (
        <ValueSellEmpty
          icon={CalendarDays}
          title="En kalender som samlar dagen"
          description="Koppla Google eller Outlook så syns möten bredvid uppgifter och lead-uppföljningar — en vy för hela veckan."
          trust="Lokala händelser fungerar redan; externa kalendrar synkas när du kopplat."
          primary={{ label: "Koppla kalender", to: "/connections?wizard=1&q=calendar" }}
          secondary={{ label: "Visa Kopplingar", to: "/connections?q=calendar" }}
        />
      ) : null}

      <PageModeTabs
        value={viewMode}
        aria-label="Kalendervy"
        onChange={setViewMode}
        options={[
          { value: "day", label: "Dag" },
          { value: "week", label: "Vecka" },
          { value: "month", label: "Månad" },
        ]}
      />

      {oauthErrorDetails && (
        <OAuthErrorAlert
          details={oauthErrorDetails}
          message={formatOAuthErrorMessage(oauthErrorDetails)}
          onDismiss={clearOauthError}
        />
      )}
      {providerError && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <p className="text-sm text-destructive">{providerError}</p>
            <Button variant="ghost" size="sm" onClick={() => void refreshProviderEvents()}>
              Försök igen
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
              locale={sv}
              modifiers={{ hasEvents: datesWithEvents }}
              modifiersClassNames={{
                hasEvents: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
              }}
            />
            <p className="mt-4 text-[11px] text-muted-foreground">
              Koppla Google/Outlook under{" "}
              <Link to="/connections?q=calendar" className="underline underline-offset-2 hover:text-foreground">
                Kopplingar
              </Link>
              .
            </p>
            <div className="flex items-center justify-between mt-3">
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" onClick={navPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium capitalize truncate px-2 max-w-[160px]">
                {navTitle}
              </span>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" onClick={navNext}>
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
                {providerLoading ? "Uppdaterar…" : "Uppdatera kopplad kalender"}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl min-h-[400px] flex flex-col w-full">
          <CardContent className="flex-1 p-6 overflow-auto">
            <CalendarViews
              viewMode={viewMode}
              currentDate={currentDate}
              events={allEvents}
              focusedEventId={focusedEventId}
              providerLoading={providerLoading}
              showProviderLoading={Boolean(activeCalendarAccount)}
              onOpenSocialPost={openPostDialog}
              onEditEvent={openEditDialog}
              onRemoveEvent={removeEvent}
            />
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
                  · {format(dayFocusDate, "d MMM", { locale: sv })}
                </span>
              </>
            ) : (
              `J/K bläddra händelser ${format(dayFocusDate, "d MMM", { locale: sv })}`
            )}
          </span>
          <span className="hidden sm:inline">O öppna</span>
        </div>
      ) : null}

      {smartSuggestions.length > 0 && (
        <Card className="rounded-xl border-dashed">
          <CardContent className="py-4 space-y-3">
            <h2 className="text-sm font-semibold">Förslag till din kalender</h2>
            <p className="text-xs text-muted-foreground">
              Hämtas automatiskt från uppgifter och lead-uppföljningar som är försenade eller ska göras idag.
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
            <AutomationEnableHint
              compact
              tab="reports"
              focus="lead-reminder"
              title="Påminn om uppföljningar automatiskt"
              description="Lead- och uppgiftspåminnelser mailar dig om deadlines — så kalendern inte blir den enda platsen du måste kolla."
              ctaLabel="Aktivera påminnelser"
            />
          </CardContent>
        </Card>
      )}

      <CalendarUpcomingStrip events={upcomingEvents} onOpenSocialPost={openPostDialog} />

      </div>

      <CalendarEventDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
        editingEventId={editingEventId}
        values={eventForm}
        onChange={(patch) => setEventForm((prev) => ({ ...prev, ...patch }))}
        onSave={saveEvent}
      />

      <ScheduledPostDialog
        post={postDialog}
        formDate={postFormDate}
        formTime={postFormTime}
        onFormDateChange={setPostFormDate}
        onFormTimeChange={setPostFormTime}
        onClose={() => setPostDialog(null)}
        onSave={savePostReschedule}
      />
    </div>
  );
}
