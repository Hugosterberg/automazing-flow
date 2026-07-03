import { mcpStatusLabel } from "./useMcpProvidersStatus";
import type { McpProviderReadiness } from "./intelligenceService";

export function McpReadinessHint({ readiness }: { readiness?: McpProviderReadiness | null }) {
  if (!readiness || readiness.status === "ready") return null;
  const tone =
    readiness.status === "missing_credential" || readiness.status === "auth_expired"
      ? "text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
      : "text-muted-foreground border-border bg-muted/30";

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`}>
      <span className="font-medium">{mcpStatusLabel(readiness.status)}</span>
      {readiness.message ? ` — ${readiness.message}` : null}
      {readiness.status === "not_connected" && readiness.auth === "api_key" ? (
        <span> ({readiness.credentialHint})</span>
      ) : null}
    </div>
  );
}
