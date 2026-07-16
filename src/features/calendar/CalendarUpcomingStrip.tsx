import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import type { CalendarEvent } from "@/types/calendar";
import type { ScheduledPost } from "@/features/social";
import { isExternalEvent } from "./calendarHelpers";

export type CalendarUpcomingItem = CalendarEvent & { post?: ScheduledPost };

type Props = {
  events: CalendarUpcomingItem[];
  onOpenSocialPost: (post: ScheduledPost) => void;
};

/** Horizontal strip of upcoming calendar items below the main workspace. */
export function CalendarUpcomingStrip({ events, onOpenSocialPost }: Props) {
  if (events.length === 0) return null;

  return (
    <Card className="rounded-xl">
      <CardContent className="py-4">
        <h2 className="text-sm font-semibold mb-3">Kommande händelser</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className={cn(
                "shrink-0 w-44 p-3 rounded-lg border border-border/50 bg-muted/20",
                ev.source === "social" && "cursor-pointer hover:bg-muted/40"
              )}
              onClick={ev.source === "social" && ev.post ? () => onOpenSocialPost(ev.post as ScheduledPost) : undefined}
            >
              <p className="font-medium text-sm truncate">{ev.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                <span>
                  {format(parseISO(ev.date), "EEE d MMM", { locale: sv })}
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
  );
}
