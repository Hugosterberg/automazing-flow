import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/relativeTime";
import type { AutomationRunStatus as AutomationRunStatusData } from "./automationService";

/** Swedish labels for the count fields the jobs report, in display order. */
const RESULT_LABELS: Array<{ key: string; label: string }> = [
  { key: "sent", label: "skickade" },
  { key: "drafted", label: "utkast" },
  { key: "written", label: "sparade" },
  { key: "created", label: "skapade" },
  { key: "removed", label: "rensade" },
  { key: "skipped", label: "hoppade över" },
  { key: "failed", label: "misslyckade" },
];

/**
 * Compact one-line summary of the counts a run reported, e.g. "3 skickade ·
 * 1 misslyckade". Only positive numeric fields are shown so quiet runs stay
 * quiet. Returns null when there is nothing worth showing.
 */
function summariseResult(result: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const { key, label } of RESULT_LABELS) {
    const value = result[key];
    if (typeof value === "number" && value > 0) {
      parts.push(`${value} ${label}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Per-automation run status shown under each schedule card: last run (relative
 * time + success/failure) and the next scheduled run. Handles every state
 * explicitly — loading, error, and "never run" all render quietly rather than
 * as failures.
 */
export function AutomationRunStatus({
  run,
  loading,
  error,
}: {
  run: AutomationRunStatusData | undefined;
  loading: boolean;
  error: string | null;
}) {
  const nextRunRelative = run?.nextRunAt ? formatRelativeTime(run.nextRunAt) : null;
  const nextRunAbsolute = run?.nextRunAt
    ? new Date(run.nextRunAt).toLocaleString("sv-SE", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const nextRunLine =
    run && nextRunRelative ? (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title={nextRunAbsolute ?? undefined}
      >
        <Clock className="h-3 w-3" aria-hidden />
        Nästa körning {nextRunRelative}
      </span>
    ) : null;

  let lastRunLine: React.ReactNode;
  if (loading) {
    lastRunLine = (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Hämtar körstatus…
      </span>
    );
  } else if (error) {
    lastRunLine = (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title={error}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Kunde inte hämta körstatus
      </span>
    );
  } else if (!run || !run.lastRun) {
    // A cron that has never run: quiet, not an error.
    lastRunLine = (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CircleDashed className="h-3 w-3" aria-hidden />
        Har inte körts än
      </span>
    );
  } else {
    const { lastRun } = run;
    const when = formatRelativeTime(lastRun.finishedAt ?? lastRun.startedAt);
    const ok = lastRun.status === "ok";
    const resultSummary = summariseResult(lastRun.result);
    const title = ok
      ? resultSummary ?? undefined
      : lastRun.errorMessage ?? resultSummary ?? undefined;
    lastRunLine = (
      <span
        className={`inline-flex items-center gap-1 text-[11px] ${
          ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
        }`}
        title={title}
      >
        {ok ? (
          <CheckCircle2 className="h-3 w-3" aria-hidden />
        ) : (
          <XCircle className="h-3 w-3" aria-hidden />
        )}
        {ok ? "Kördes" : "Misslyckades"}
        {when ? ` ${when}` : ""}
        {resultSummary ? (
          <span className="text-muted-foreground">· {resultSummary}</span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t border-border/60">
      {lastRunLine}
      {nextRunLine}
    </div>
  );
}
