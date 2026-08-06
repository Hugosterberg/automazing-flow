import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTimeMedium } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import type { AutomationRunStatus as AutomationRunStatusData } from "./automationService";

const RESULT_KEYS = [
  "sent",
  "drafted",
  "written",
  "created",
  "removed",
  "skipped",
  "failed",
] as const;

/**
 * Compact one-line summary of the counts a run reported.
 * Returns null when there is nothing worth showing.
 */
function summariseResult(
  result: Record<string, unknown>,
  labelFor: (key: (typeof RESULT_KEYS)[number]) => string
): string | null {
  const parts: string[] = [];
  for (const key of RESULT_KEYS) {
    const value = result[key];
    if (typeof value === "number" && value > 0) {
      parts.push(`${value} ${labelFor(key)}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Per-automation run status shown under each schedule card: last run (relative
 * time + success/failure) and the next scheduled run.
 */
export function AutomationRunStatus({
  run,
  loading,
  error,
  onRetry,
  retrying,
}: {
  run: AutomationRunStatusData | undefined;
  loading: boolean;
  error: string | null;
  /** Retry the failed job; the button only shows when the last run failed. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation("automations");

  const labelFor = (key: (typeof RESULT_KEYS)[number]) =>
    key === "failed" ? t("runStatus.failedCount") : t(`runStatus.${key}`);

  const nextRunRelative = run?.nextRunAt ? formatRelativeTime(run.nextRunAt) : null;
  const nextRunAbsolute = run?.nextRunAt ? formatDateTimeMedium(run.nextRunAt) : null;

  const nextRunLine =
    run && nextRunRelative ? (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title={nextRunAbsolute ?? undefined}
      >
        <Clock className="h-3 w-3" aria-hidden />
        {t("runStatus.nextRun", { when: nextRunRelative })}
      </span>
    ) : null;

  let lastRunLine: React.ReactNode;
  if (loading) {
    lastRunLine = (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {t("runStatus.loading")}
      </span>
    );
  } else if (error) {
    lastRunLine = (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title={error}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {t("runStatus.loadFailed")}
      </span>
    );
  } else if (!run || !run.lastRun) {
    lastRunLine = (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CircleDashed className="h-3 w-3" aria-hidden />
        {t("runStatus.never")}
      </span>
    );
  } else {
    const { lastRun } = run;
    const when = formatRelativeTime(lastRun.finishedAt ?? lastRun.startedAt);
    const ok = lastRun.status === "ok";
    const resultSummary = summariseResult(lastRun.result, labelFor);
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
        {ok ? t("runStatus.ran") : t("runStatus.failed")}
        {when ? ` ${when}` : ""}
        {resultSummary ? (
          <span className="text-muted-foreground">· {resultSummary}</span>
        ) : null}
      </span>
    );
  }

  const lastRunFailed = !loading && !error && run?.lastRun?.status === "failed";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t border-border/60">
      {lastRunLine}
      {nextRunLine}
      {lastRunFailed && onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px] ml-auto"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="h-3 w-3" aria-hidden />
          )}
          <span className="ml-1">{retrying ? t("runStatus.retrying") : t("runStatus.retry")}</span>
        </Button>
      ) : null}
    </div>
  );
}
