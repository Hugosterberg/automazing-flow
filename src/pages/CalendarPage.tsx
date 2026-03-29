import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Clock,
  Zap,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAccounts } from "@/context/AccountsContext";
import { useAccountData } from "@/hooks/useAccountData";

const STORAGE_KEY = "automazing-calendar-events";

function loadEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEvents(events: CalendarEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function sortByTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

type ViewMode = "day" | "week" | "month";
type CalendarProviderData = {
  source?: string;
  events?: CalendarEvent[];
  calendars?: Array<{ id: string; name: string; primary?: boolean }>;
  note?: string;
} | null;

export default function CalendarPage() {
  const { oauthError, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const selectedAccountId = getSelectedAccountId("calendar");
  const [events, setEvents] = useState<CalendarEvent[]>(loadEvents);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formAutomated, setFormAutomated] = useState(false);

  useEffect(() => {
    saveEvents(events);
  }, [events]);

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
    fetcher: async (accountId) => {
      const res = await fetch(`/api/accounts/${accountId}/data`, { credentials: "include" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not fetch external calendar events.");
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
  const allEvents = useMemo(() => [...localEvents, ...externalEvents], [localEvents, externalEvents]);

  const eventsOnDate = (date: Date) =>
    allEvents.filter((e) => isSameDay(parseISO(e.date), date));

  const addEvent = () => {
    if (!formTitle.trim() || !formDate) return;
    setEvents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        date: formDate,
        time: formTime.trim() || undefined,
        isAutomated: formAutomated,
        createdAt: new Date().toISOString(),
      },
    ]);
    setFormTitle("");
    setFormTime("");
    setFormAutomated(false);
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setDialogOpen(false);
  };

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const openDialog = () => {
    setFormDate(selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    setFormTitle("");
    setFormTime("");
    setFormAutomated(false);
    setDialogOpen(true);
  };

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
    if (activeProfileId) params.set("profile_id", activeProfileId);
    if (provider !== "auto") params.set("provider", provider);
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `/api/auth/${platform}${query}`;
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => connectCalendar("google_calendar", "auto")}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Connect Google Calendar
          </Button>
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </div>

      {oauthError && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <p className="text-sm text-destructive">
              {oauthError === "google_calendar_not_configured"
                ? "Google Calendar is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env."
                : oauthError === "outlook_calendar_not_configured"
                  ? "Outlook Calendar is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env."
                  : `Calendar connect failed: ${oauthError.replace(/_/g, " ")}`}
            </p>
            <Button variant="ghost" size="sm" onClick={clearOauthError}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] gap-6 items-start">
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
                    {sortByTime(eventsOnDate(currentDate)).map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted group"
                      >
                        {ev.isAutomated ? (
                          <Zap className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{ev.title}</p>
                          {ev.time && (
                            <p className="text-xs text-muted-foreground">{ev.time}</p>
                          )}
                        </div>
                        {!ev.readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            onClick={() => removeEvent(ev.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {viewMode === "week" && (
              <div className="grid grid-cols-7 gap-2 min-w-0">
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
                        <p className="text-[10px] uppercase text-muted-foreground">
                          {format(day, "EEE", { locale: enUS })}
                        </p>
                        <p className="text-sm font-semibold">{format(day, "d")}</p>
                      </div>
                      <ul className="space-y-1">
                        {sortByTime(dayEvents).map((ev) => (
                          <li
                            key={ev.id}
                            className="group flex items-center gap-1 rounded px-1.5 py-1 bg-background/80 hover:bg-muted text-xs"
                          >
                            {ev.isAutomated ? (
                              <Zap className="h-3 w-3 text-primary shrink-0" />
                            ) : (
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="truncate flex-1">{ev.title}</span>
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
            )}

            {viewMode === "month" && (
              <div className="grid grid-cols-7 gap-1">
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
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">
                          {dayEvents.length} event{dayEvents.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {upcomingEvents.length > 0 && (
        <Card className="rounded-xl">
          <CardContent className="py-4">
            <h2 className="text-sm font-semibold mb-3">Upcoming events</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {upcomingEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="shrink-0 w-44 p-3 rounded-lg border border-border/50 bg-muted/20"
                >
                  <p className="font-medium text-sm truncate">{ev.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(parseISO(ev.date), "EEE d MMM", { locale: enUS })}
                    {ev.time && ` · ${ev.time}`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Add activity</DialogTitle>
            <DialogDescription>
              Add an activity or automated task to the calendar
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
            <Button onClick={addEvent} disabled={!formTitle.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
