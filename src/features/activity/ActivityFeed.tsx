import { formatRelativeTime } from "@/lib/relativeTime";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEventRow } from "./useActivityFeed";

const SEVERITY_STYLES: Record<ActivityEventRow["severity"], string> = {
  info: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

function SeverityIcon({
  severity,
  className,
}: {
  severity: ActivityEventRow["severity"];
  className?: string;
}) {
  switch (severity) {
    case "success":
      return <CheckCircle2 className={className} aria-hidden />;
    case "warning":
      return <AlertTriangle className={className} aria-hidden />;
    case "error":
      return <XCircle className={className} aria-hidden />;
    case "info":
    default:
      return <Info className={className} aria-hidden />;
  }
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  return formatRelativeTime(iso) ?? iso.slice(0, 19);
}

interface Props {
  events: ActivityEventRow[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** Limit rendered rows (for compact drawer usage). */
  maxRows?: number;
  className?: string;
}

/**
 * Read-only feed of activity_events rows. Keep it presentational: the
 * caller decides which events to pass in via `useActivityFeed()`, including
 * subject/module filtering.
 *
 * Compact by default, fits drawers and side panels. For a full-page feed
 * just omit maxRows and wrap in a ScrollArea.
 */
export function ActivityFeed({
  events,
  isLoading,
  emptyMessage = "No activity yet.",
  maxRows,
  className,
}: Props) {
  if (isLoading) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Loading activity…
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {emptyMessage}
      </p>
    );
  }

  const rows = maxRows ? events.slice(0, maxRows) : events;

  return (
    <ul className={cn("space-y-1.5", className)}>
      {rows.map((e) => {
        const when = relativeTime(e.occurred_at);
        return (
          <li
            key={e.id}
            className="rounded-md border border-border/70 bg-muted/20 px-3 py-2"
          >
            <div className="flex items-start gap-2 text-xs">
              <SeverityIcon
                severity={e.severity}
                className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", SEVERITY_STYLES[e.severity])}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground break-words">
                  {e.summary}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">
                    {e.module}
                    {e.event_type ? ` · ${e.event_type}` : ""}
                  </span>
                  {when ? <span className="tabular-nums">{when}</span> : null}
                </p>
              </div>
            </div>
          </li>
        );
      })}
      {maxRows && events.length > maxRows ? (
        <li className="text-[11px] text-muted-foreground px-1">
          Showing {maxRows} of {events.length} events.
        </li>
      ) : null}
    </ul>
  );
}
