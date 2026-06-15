import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDiagnostics, type CheckStatus, type DiagnosticCheck } from "./useDiagnostics";

const STATUS_ICON: Record<CheckStatus, React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};
const STATUS_TONE: Record<CheckStatus, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
};

function CheckRow({ check }: { check: DiagnosticCheck }) {
  const Icon = STATUS_ICON[check.status];
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", STATUS_TONE[check.status])} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm text-foreground">{check.label}</p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
        {check.fix ? <p className="text-[11px] text-muted-foreground/80 mt-0.5">→ {check.fix}</p> : null}
      </div>
    </div>
  );
}

/**
 * System health — surfaces the /api/diagnostics report in the UI so config gaps
 * and pending migrations are visible without the CLI. Action-needed items
 * (errors then warnings) show first; healthy checks collapse behind a toggle.
 */
export function SystemHealthCard() {
  const { report, isLoading, isError, refetch } = useDiagnostics();
  const [showOk, setShowOk] = useState(false);

  const actionNeeded = report
    ? report.checks
        .filter((c) => c.status !== "ok")
        .sort((a, b) => (a.status === "error" ? -1 : 1) - (b.status === "error" ? -1 : 1))
    : [];
  const okChecks = report ? report.checks.filter((c) => c.status === "ok") : [];

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              System health
            </CardTitle>
            <CardDescription>
              {report
                ? `${report.summary.error} error · ${report.summary.warn} warning · ${report.summary.ok} ok`
                : "Configuration and database checks."}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => void refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="sr-only">Refresh diagnostics</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !report ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Running checks…
          </div>
        ) : isError || !report ? (
          <p className="text-sm text-muted-foreground py-2">Couldn't load the health report.</p>
        ) : (
          <div className="space-y-1">
            {report.summary.error === 0 && report.summary.warn === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
                Everything looks healthy.
              </div>
            ) : (
              <>
                {report.summary.error > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mb-1">
                    <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {report.summary.error} item{report.summary.error === 1 ? "" : "s"} must be fixed.
                  </div>
                ) : null}
                <div className="divide-y divide-border/50">
                  {actionNeeded.map((c) => (
                    <CheckRow key={c.id} check={c} />
                  ))}
                </div>
              </>
            )}

            {okChecks.length > 0 ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowOk((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showOk && "rotate-180")} />
                  {showOk ? "Hide" : "Show"} {okChecks.length} healthy check{okChecks.length === 1 ? "" : "s"}
                </button>
                {showOk ? (
                  <div className="divide-y divide-border/50 mt-1">
                    {okChecks.map((c) => (
                      <CheckRow key={c.id} check={c} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
