import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  PlugZap,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { automationCatalog } from "@/features/automation/automationCatalog";
import { useAutomationRuns } from "@/features/automation/useAutomationRuns";
import { fetchAutoReplyLog, type AutoReplyLogEntry } from "@/features/automation/automationService";
import { useMcpProvidersStatus, mcpStatusLabel } from "@/features/intelligence/useMcpProvidersStatus";
import {
  CONNECTION_CATALOG,
  type AppArea,
} from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";
import { aggregateStatus, CONNECTION_STATUS_LABELS, type ConnectionStatus } from "./connectionStatus";
import { formatRelativeTime } from "@/lib/relativeTime";
import type { AccountPlatform } from "@/types/accounts";

export type HealthIssueCategory = "cron" | "connection" | "mcp" | "automation";

export interface HealthIssue {
  id: string;
  severity: "error" | "warning";
  category: HealthIssueCategory;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

function cronTitle(key: string): string {
  return automationCatalog.find((e) => e.cronKey === key)?.title ?? key;
}

const ATTENTION_CONNECTION_STATUSES: ConnectionStatus[] = ["error", "reconnect_required"];

function connectionIssues(connections: Connection[]): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const seen = new Set<string>();

  for (const entry of CONNECTION_CATALOG) {
    if (entry.area === "intelligence") continue;
    const rows = connections.filter((c) => c.platform === entry.platform);
    const status = aggregateStatus(rows);
    if (!ATTENTION_CONNECTION_STATUSES.includes(status)) continue;
    if (seen.has(entry.platform)) continue;
    seen.add(entry.platform);

    const lastError = rows.find((r) => r.lastSyncError)?.lastSyncError;
    issues.push({
      id: `connection-${entry.platform}`,
      severity: status === "error" ? "error" : "warning",
      category: "connection",
      title: `${entry.label} — ${CONNECTION_STATUS_LABELS[status]}`,
      message: lastError || entry.connectSteps,
      actionHref: "/connections?tab=integrations",
      actionLabel: "Open connections",
    });
  }
  return issues;
}

function mcpIssues(
  providers: ReturnType<typeof useMcpProvidersStatus>["providers"]
): HealthIssue[] {
  return providers
    .filter((p) => p.status !== "ready")
    .map((p) => ({
      id: `mcp-${p.platform}`,
      severity:
        p.status === "error" || p.status === "auth_expired" || p.status === "missing_credential"
          ? ("error" as const)
          : ("warning" as const),
      category: "mcp" as const,
      title: `${p.label} — ${mcpStatusLabel(p.status)}`,
      message:
        p.message ||
        (p.status === "not_connected"
          ? `Required for: ${p.usedBy.slice(0, 2).join(", ")}${p.usedBy.length > 2 ? "…" : ""}`
          : "MCP calls will fail until this is fixed."),
      actionHref: "/connections?tab=mcp",
      actionLabel: "Fix MCP connection",
    }));
}

function categoryLabel(category: HealthIssueCategory): string {
  switch (category) {
    case "cron":
      return "Scheduled jobs";
    case "connection":
      return "Integrations";
    case "mcp":
      return "MCP providers";
    case "automation":
      return "Automation log";
  }
}

function IssueRow({ issue }: { issue: HealthIssue }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5 text-sm">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 font-medium">
          {issue.severity === "error" ? (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden />
          )}
          {issue.title}
        </div>
        <p className="text-xs text-muted-foreground">{issue.message}</p>
        <Badge variant="outline" className="text-[10px] mt-1">
          {categoryLabel(issue.category)}
        </Badge>
      </div>
      {issue.actionHref ? (
        <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" asChild>
          <Link to={issue.actionHref}>{issue.actionLabel ?? "Open"}</Link>
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Control panel: failed cron jobs, broken integrations, MCP credential gaps,
 * and recent automation send failures — one place to see what is not working.
 */
export function ConnectionsControlPanel({
  businessProfileId,
  connections,
}: {
  businessProfileId: string | null;
  connections: Connection[];
}) {
  const runs = useAutomationRuns(businessProfileId);
  const { providers, isLoading: mcpLoading, refetch: refetchMcp } = useMcpProvidersStatus(businessProfileId);
  const [logLoading, setLogLoading] = useState(false);
  const [failedLog, setFailedLog] = useState<AutoReplyLogEntry[]>([]);

  useEffect(() => {
    if (!businessProfileId) {
      setFailedLog([]);
      return;
    }
    let ignore = false;
    setLogLoading(true);
    void fetchAutoReplyLog(businessProfileId, 30)
      .then(({ entries }) => {
        if (ignore) return;
        setFailedLog(entries.filter((e) => e.status === "failed").slice(0, 8));
      })
      .catch(() => {
        if (!ignore) setFailedLog([]);
      })
      .finally(() => {
        if (!ignore) setLogLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [businessProfileId]);

  const issues = useMemo(() => {
    const list: HealthIssue[] = [];

    if (!runs.loading && !runs.error) {
      for (const run of Object.values(runs.byKey)) {
        if (run?.lastRun?.status === "failed") {
          list.push({
            id: `cron-${run.key}`,
            severity: "error",
            category: "cron",
            title: `${cronTitle(run.key)} — last run failed`,
            message:
              run.lastRun.errorMessage ||
              `Failed ${formatRelativeTime(run.lastRun.finishedAt ?? run.lastRun.startedAt) ?? "recently"}.`,
            actionHref: "/automations",
            actionLabel: "View automations",
          });
        }
      }
    }

    list.push(...connectionIssues(connections));
    list.push(...mcpIssues(providers));

    for (const entry of failedLog) {
      list.push({
        id: `auto-${entry.id}`,
        severity: "error",
        category: "automation",
        title: `Auto-reply failed (${entry.platform ?? entry.kind})`,
        message: entry.error || entry.incoming_text?.slice(0, 120) || "Send or draft failed.",
        actionHref: "/messages",
        actionLabel: "Open messages",
      });
    }

    const severityOrder = { error: 0, warning: 1 };
    return list.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [runs.loading, runs.error, runs.byKey, connections, providers, failedLog]);

  const loading = runs.loading || mcpLoading || logLoading;
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" aria-hidden />
              Health control panel
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Scheduled jobs, integrations, and MCP providers where calls fail or credentials are missing.
              MCP tool calls themselves run on button click — this panel shows setup and job failures.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => void refetchMcp()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading health status…
          </p>
        ) : issues.length === 0 ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" aria-hidden />
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs text-muted-foreground">
              No failed jobs or broken connections detected. MCP queries still require connected providers with valid keys.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {errorCount > 0 ? (
                <Badge variant="destructive">{errorCount} error{errorCount === 1 ? "" : "s"}</Badge>
              ) : null}
              {warningCount > 0 ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                  {warningCount} warning{warningCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
            <ul className="space-y-2">{issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}</ul>
          </>
        )}

        <div className="flex flex-wrap gap-3 pt-2 border-t border-border/60 text-xs">
          <Link to="/automations" className="inline-flex items-center gap-1 text-primary hover:underline">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            Automations
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Link to="/intelligence" className="inline-flex items-center gap-1 text-primary hover:underline">
            <PlugZap className="h-3.5 w-3.5" aria-hidden />
            MCP Intelligence
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** Issue count for tab badges (cron failures + connections + MCP not ready). */
export function useConnectionsHealthIssueCount(
  businessProfileId: string | null,
  connections: Connection[],
  mcpProviders: ReturnType<typeof useMcpProvidersStatus>["providers"],
  runs: ReturnType<typeof useAutomationRuns>
): number {
  return useMemo(() => {
    let n = 0;
    if (!runs.loading) {
      n += Object.values(runs.byKey).filter((r) => r?.lastRun?.status === "failed").length;
    }
    n += connectionIssues(connections).length;
    n += mcpIssues(mcpProviders).length;
    return n;
  }, [businessProfileId, connections, mcpProviders, runs.loading, runs.byKey]);
}

export type { AppArea };
