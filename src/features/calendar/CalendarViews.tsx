import { format, isSameDay, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from "date-fns";
import { sv } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import type { ScheduledPost } from "@/features/social";
import { sortByTime } from "./calendarHelpers";
import { CalendarEventRow } from "./CalendarEventRow";
import type { CalendarUpcomingItem } from "./CalendarUpcomingStrip";

export type CalendarViewMode = "day" | "week" | "month";

type Props = {
  viewMode: CalendarViewMode;
  currentDate: Date;
  events: CalendarUpcomingItem[];
  focusedEventId: string | null;
  providerLoading?: boolean;
  showProviderLoading?: boolean;
  onOpenSocialPost: (post: ScheduledPost) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onRemoveEvent: (id: string) => void;
};

/** Day / week / month calendar body (right pane of CalendarPage). */
export function CalendarViews({
  viewMode,
  currentDate,
  events,
  focusedEventId,
  providerLoading,
  showProviderLoading,
  onOpenSocialPost,
  onEditEvent,
  onRemoveEvent,
}: Props) {
  const eventsOnDate = (date: Date) =>
    events.filter((e) => isSameDay(parseISO(e.date), date));

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <>
      {showProviderLoading && providerLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Laddar händelser från kopplad kalender…
        </div>
      ) : null}

      {viewMode === "day" && (
        <div className="max-w-md">
          <h2 className="text-lg font-semibold mb-4">
            {format(currentDate, "EEEE d MMMM", { locale: sv })}
          </h2>
          {eventsOnDate(currentDate).length === 0 ? (
            <p className="text-muted-foreground text-sm py-8">
              Inga aktiviteter denna dag. Tryck Lägg till för att skapa en.
            </p>
          ) : (
            <ul className="space-y-2">
              {sortByTime(eventsOnDate(currentDate)).map((ev) => (
                <CalendarEventRow
                  key={ev.id}
                  event={ev as CalendarUpcomingItem}
                  variant="day"
                  focused={focusedEventId === ev.id}
                  onOpenSocialPost={onOpenSocialPost}
                  onEdit={onEditEvent}
                  onRemove={onRemoveEvent}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {viewMode === "week" && (
        <>
          {/* Mobile (< sm): vertical day agenda — avoids horizontal min-w grid */}
          <div className="space-y-3 sm:hidden">
            {weekDays.map((day) => {
              const dayEvents = eventsOnDate(day);
              const today = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "rounded-xl border p-3",
                    today ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20"
                  )}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {format(day, "EEEE d MMM", { locale: sv })}
                    </p>
                    {today ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                        Idag
                      </span>
                    ) : null}
                  </div>
                  {dayEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">Inga händelser</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {sortByTime(dayEvents).map((ev) => (
                        <CalendarEventRow
                          key={ev.id}
                          event={ev as CalendarUpcomingItem}
                          variant="agenda"
                          focused={focusedEventId === ev.id}
                          onOpenSocialPost={onOpenSocialPost}
                          onRemove={onRemoveEvent}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {/* sm+: week grid */}
          <div className="-mx-1 hidden overflow-x-auto app-scroll px-1 sm:mx-0 sm:block sm:overflow-visible sm:px-0">
            <div className="grid grid-cols-7 gap-2">
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
                        {format(day, "EEE", { locale: sv })}
                      </p>
                      <p className="text-sm font-semibold">{format(day, "d")}</p>
                    </div>
                    <ul className="space-y-1">
                      {sortByTime(dayEvents).map((ev) => (
                        <CalendarEventRow
                          key={ev.id}
                          event={ev as CalendarUpcomingItem}
                          variant="compact"
                          focused={focusedEventId === ev.id}
                          onOpenSocialPost={onOpenSocialPost}
                          onRemove={onRemoveEvent}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {viewMode === "month" && (
        <>
          {/* Mobile (< sm): stacked day cards (days with events in the month) */}
          <div className="space-y-3 sm:hidden">
            {(() => {
              const monthAgendaDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(
                (day) => eventsOnDate(day).length > 0 || isSameDay(day, new Date())
              );
              if (monthAgendaDays.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Inga händelser denna månad.
                  </p>
                );
              }
              return monthAgendaDays.map((day) => {
                const dayEvents = eventsOnDate(day);
                const today = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "rounded-xl border p-3",
                      today ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20"
                    )}
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {format(day, "EEEE d", { locale: sv })}
                      </p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {dayEvents.length > 0 ? `${dayEvents.length} händ.` : ""}
                      </span>
                    </div>
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">Inga händelser</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {sortByTime(dayEvents).map((ev) => (
                          <CalendarEventRow
                            key={ev.id}
                            event={ev as CalendarUpcomingItem}
                            variant="agenda"
                            focused={focusedEventId === ev.id}
                            onOpenSocialPost={onOpenSocialPost}
                            onRemove={onRemoveEvent}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          {/* sm+: month grid */}
          <div className="-mx-1 hidden overflow-x-auto app-scroll px-1 sm:mx-0 sm:block sm:overflow-visible sm:px-0">
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
        </>
      )}
    </>
  );
}
