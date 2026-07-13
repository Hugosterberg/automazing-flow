import { useEffect, useRef } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";
import { SearchHighlight } from "@/features/messages/SearchHighlight";
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
  maxRows?: number;
  className?: string;
  selectedId?: string | null;
  onSelect?: (event: ActivityEventRow) => void;
  variant?: "cards" | "list";
  searchQuery?: string;
}

export function ActivityFeed({
  events,
  isLoading,
  emptyMessage = "Ingen aktivitet ännu.",
  maxRows,
  className,
  selectedId,
  onSelect,
  variant = "cards",
  searchQuery = "",
}: Props) {
  const listMode = variant === "list" && Boolean(onSelect);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedId || !listMode) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, events.length, listMode]);

  if (isLoading) {
    if (listMode) {
      return (
        <div className={cn("divide-y divide-border/40", className)}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2.5 shimmer">
              <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded bg-muted/60" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-3/4 rounded bg-muted/60" />
                <div className="h-2 w-1/2 rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    return <p className={cn("text-xs text-muted-foreground", className)}>Laddar aktivitet…</p>;
  }

  if (events.length === 0) {
    if (listMode) {
      return (
        <div className={cn("flex h-full min-h-[200px] items-center justify-center p-6 text-center", className)}>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }
    return <p className={cn("text-xs text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  const rows = maxRows ? events.slice(0, maxRows) : events;

  if (listMode) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground/80">Händelser</p>
          <span className="text-[10px] tabular-nums text-muted-foreground">{rows.length} st</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto app-scroll">
          {rows.map((e) => {
            const when = relativeTime(e.occurred_at);
            const selected = selectedId === e.id;
            return (
              <li key={e.id}>
                <button
                  ref={(el) => {
                    if (el) rowRefs.current.set(e.id, el);
                    else rowRefs.current.delete(e.id);
                  }}
                  type="button"
                  onClick={() => onSelect?.(e)}
                  className={cn(
                    "relative w-full border-b border-border/35 px-3 py-2 text-left transition-colors duration-150",
                    "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                    selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]"
                  )}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="flex items-start gap-2">
                    <SeverityIcon
                      severity={e.severity}
                      className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", SEVERITY_STYLES[e.severity])}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-[13px]", selected ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
                        <SearchHighlight text={e.summary} query={searchQuery} />
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">
                          <SearchHighlight text={e.module} query={searchQuery} />
                        </span>
                        {when ? <span className="tabular-nums">{when}</span> : null}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {rows.map((e) => {
        const when = relativeTime(e.occurred_at);
        return (
          <li
            key={e.id}
            className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 shadow-sm transition-colors hover:bg-muted/20"
          >
            <div className="flex items-start gap-2 text-xs">
              <SeverityIcon
                severity={e.severity}
                className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", SEVERITY_STYLES[e.severity])}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground break-words">{e.summary}</p>
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
          Visar {maxRows} av {events.length} händelser.
        </li>
      ) : null}
    </ul>
  );
}
