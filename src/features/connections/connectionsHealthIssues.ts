/**
 * Health-issue derivation for the Connections Center: which integrations and
 * MCP providers need attention, and the aggregate count used by the Health
 * tab badge. Lives outside ConnectionsControlPanel.tsx so that component file
 * only exports components (keeps Fast Refresh working).
 */

import { useMemo } from "react";
import { connectionSyncLooksLikePermissionError } from "@/lib/oauthPermissionErrors";
import { useMcpProvidersStatus, mcpStatusLabel } from "@/features/intelligence/useMcpProvidersStatus";
import { CONNECTION_CATALOG, catalogConnectSteps } from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";
import type { useAutomationRuns } from "@/features/automation/useAutomationRuns";
import { aggregateStatus, CONNECTION_STATUS_LABELS, type ConnectionStatus } from "./connectionStatus";

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

const ATTENTION_CONNECTION_STATUSES: ConnectionStatus[] = ["error", "reconnect_required"];

export function connectionIssues(connections: Connection[]): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const seen = new Set<string>();

  for (const entry of CONNECTION_CATALOG) {
    if (entry.areas.includes("intelligence")) continue;
    const rows = connections.filter((c) => c.platform === entry.platform);
    const status = aggregateStatus(rows);
    if (!ATTENTION_CONNECTION_STATUSES.includes(status)) continue;
    if (seen.has(entry.platform)) continue;
    seen.add(entry.platform);

    const lastError = rows.find((r) => r.lastSyncError)?.lastSyncError;
    const permissionIssue = lastError ? connectionSyncLooksLikePermissionError(lastError) : false;
    issues.push({
      id: `connection-${entry.platform}`,
      severity: status === "error" ? "error" : "warning",
      category: "connection",
      title: `${entry.label} — ${permissionIssue ? "Behörighet saknas" : CONNECTION_STATUS_LABELS[status]}`,
      message: lastError || catalogConnectSteps(entry),
      actionHref: "/connections?filter=attention",
      actionLabel: "Öppna Kopplingar",
    });
  }
  return issues;
}

export function mcpIssues(
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
          ? `Krävs för: ${p.usedBy.slice(0, 2).join(", ")}${p.usedBy.length > 2 ? "…" : ""}`
          : "MCP-anrop misslyckas tills detta är åtgärdat."),
      actionHref: "/connections?tab=mcp",
      actionLabel: "Åtgärda MCP-koppling",
    }));
}

/** Issue count for tab badges (cron failures + connections + MCP not ready). */
export function useConnectionsHealthIssueCount(
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
  }, [connections, mcpProviders, runs.loading, runs.byKey]);
}
