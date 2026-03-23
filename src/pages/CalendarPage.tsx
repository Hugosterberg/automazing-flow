import { useState, useEffect } from "react";
import {
  Plus,
  Clock,
  Zap,
  Trash2,
  ChevronLeft,
  ChevronRight,
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

export default function CalendarPage() {
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

  const eventsOnDate = (date: Date) =>
    events.filter((e) => isSameDay(parseISO(e.date), date));

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

  const datesWithEvents = [...new Set(events.map((e) => e.date))].map((d) =>
    parseISO(d)
  );

  const upcomingEvents = events
    .filter((e) => parseISO(e.date) >= startOfDay(new Date()))
    .sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      return dc !== 0 ? dc : (a.time || "").localeCompare(b.time || "");
    })
    .slice(0, 8);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="rounded-xl shrink-0">
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
          </CardContent>
        </Card>

        <Card className="rounded-xl min-h-[400px] flex flex-col">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={() => removeEvent(ev.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                        "min-h-[80px] rounded-lg border p-2 flex flex-col",
                        inMonth ? "border-border/50" : "border-transparent opacity-50",
                        today && "ring-1 ring-primary/30 bg-primary/5"
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm font-medium w-6 h-6 flex items-center justify-center rounded",
                          today && "bg-primary text-primary-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="flex-1 overflow-hidden mt-1 space-y-0.5">
                        {sortByTime(dayEvents).slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-muted/60 text-[10px] truncate"
                          >
                            {ev.isAutomated ? (
                              <Zap className="h-2.5 w-2.5 shrink-0 text-primary" />
                            ) : (
                              <Clock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <p className="text-[9px] text-muted-foreground">
                            +{dayEvents.length - 2}
                          </p>
                        )}
                      </div>
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
