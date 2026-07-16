import { Clock, Zap, Trash2, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { SCHEDULED_POST_STATUS_LABELS, type ScheduledPost } from "@/features/social";
import { isExternalEvent } from "./calendarHelpers";
import type { CalendarUpcomingItem } from "./CalendarUpcomingStrip";

type Variant = "day" | "agenda" | "compact";

type Props = {
  event: CalendarUpcomingItem;
  variant: Variant;
  focused?: boolean;
  onOpenSocialPost?: (post: ScheduledPost) => void;
  onEdit?: (event: CalendarUpcomingItem) => void;
  onRemove?: (id: string) => void;
};

function EventIcon({
  event,
  className,
}: {
  event: CalendarUpcomingItem;
  className: string;
}) {
  if (event.source === "social") {
    return <Send className={cn("text-primary shrink-0", className)} />;
  }
  if (event.isAutomated) {
    return <Zap className={cn("text-primary shrink-0", className)} />;
  }
  return <Clock className={cn("text-muted-foreground shrink-0", className)} />;
}

/** Shared event row for day / week / month calendar views. */
export function CalendarEventRow({
  event: ev,
  variant,
  focused,
  onOpenSocialPost,
  onEdit,
  onRemove,
}: Props) {
  const socialClick =
    ev.source === "social" && ev.post && onOpenSocialPost
      ? () => onOpenSocialPost(ev.post as ScheduledPost)
      : undefined;

  if (variant === "day") {
    return (
      <li
        data-calendar-event-id={ev.id}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted group",
          ev.source === "social" && "cursor-pointer",
          focused && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
        onClick={socialClick}
      >
        <EventIcon event={ev} className="h-4 w-4" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{ev.title}</p>
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            {ev.time ? <span>{ev.time}</span> : null}
            {ev.source === "social" && ev.post ? (
              <>
                {ev.post.platforms.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-primary/10 text-primary px-1 py-0.5 text-[10px] uppercase tracking-wide"
                  >
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
            {onEdit ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(ev)}
                aria-label="Redigera händelse"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {onRemove ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onRemove(ev.id)}
                aria-label="Ta bort händelse"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        )}
      </li>
    );
  }

  if (variant === "agenda") {
    return (
      <li
        data-calendar-event-id={ev.id}
        className={cn(
          "group flex items-center gap-2 rounded-lg bg-background/80 px-2 py-2 text-sm",
          ev.source === "social" && "cursor-pointer",
          focused && "ring-1 ring-primary"
        )}
        onClick={socialClick}
      >
        <EventIcon event={ev} className="h-3.5 w-3.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{ev.title}</p>
          {ev.time ? (
            <p className="text-[11px] text-muted-foreground">{ev.time}</p>
          ) : null}
        </div>
        {!ev.readOnly && onRemove ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(ev.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </li>
    );
  }

  // compact — week grid
  return (
    <li
      data-calendar-event-id={ev.id}
      className={cn(
        "group flex items-center gap-1 rounded px-1.5 py-1 bg-background/80 hover:bg-muted text-xs",
        ev.source === "social" && "cursor-pointer",
        focused && "ring-1 ring-primary"
      )}
      onClick={socialClick}
    >
      <EventIcon event={ev} className="h-3 w-3" />
      <span className="truncate flex-1">{ev.title}</span>
      {ev.source === "social" && ev.post ? (
        <span className="shrink-0 text-[9px] uppercase text-primary">
          {ev.post.platforms.length > 0 ? platformLabel(ev.post.platforms[0]) : "Post"}
          {ev.post.platforms.length > 1 ? ` +${ev.post.platforms.length - 1}` : ""}
        </span>
      ) : isExternalEvent(ev) ? (
        <span className="shrink-0 text-[9px] uppercase text-muted-foreground">Ext</span>
      ) : null}
      {!ev.readOnly && onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(ev.id);
          }}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      ) : null}
    </li>
  );
}
