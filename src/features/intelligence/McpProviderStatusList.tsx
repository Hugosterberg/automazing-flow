import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMcpProvidersStatus, mcpStatusLabel } from "./useMcpProvidersStatus";
import type { McpProviderReadiness } from "./intelligenceService";

function StatusIcon({ status }: { status: McpProviderReadiness["status"] }) {
  if (status === "ready") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  if (status === "missing_credential" || status === "auth_expired") {
    return <KeyRound className="h-3.5 w-3.5 text-amber-600" aria-hidden />;
  }
  if (status === "error") return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />;
  if (status === "not_connected") return <Unplug className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  return null;
}

function statusBadgeVariant(
  status: McpProviderReadiness["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "missing_credential" || status === "auth_expired") return "destructive";
  if (status === "error") return "destructive";
  return "outline";
}

/** Read-only list of all MCP providers and readiness — shared by Connections and Intelligence hub. */
export function McpProviderStatusList({ businessProfileId }: { businessProfileId: string | null }) {
  const { providers, isLoading, refetch } = useMcpProvidersStatus(businessProfileId);
  const needsAttention = providers.filter(
    (p) => p.status === "missing_credential" || p.status === "auth_expired" || p.status === "error"
  );

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading provider status…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {needsAttention.length > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {needsAttention.length} provider{needsAttention.length === 1 ? "" : "s"} need attention before features can call them.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">All connected providers have valid credentials.</p>
        )}
        <Button type="button" size="sm" variant="ghost" className="gap-1.5 h-7 shrink-0" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      <ul className="space-y-2">
        {providers.map((p) => (
          <li
            key={p.platform}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 font-medium">
                <StatusIcon status={p.status} />
                {p.label}
              </div>
              {p.usedBy.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">Used by: {p.usedBy.join(" · ")}</p>
              ) : null}
              {p.message && p.status !== "ready" ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">{p.message}</p>
              ) : null}
              {p.status === "not_connected" && p.auth === "api_key" ? (
                <p className="text-[11px] text-muted-foreground">Requires: {p.credentialHint}</p>
              ) : null}
            </div>
            <Badge variant={statusBadgeVariant(p.status)}>{mcpStatusLabel(p.status)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
