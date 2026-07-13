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
          {readiness.status === "not_connected" ? (
        <p className="mt-1 text-[11px] leading-snug">
          {readiness.auth === "oauth"
            ? "Åtgärd: koppla via OAuth under Kopplingar → MCP."
            : readiness.auth === "shop_domain"
              ? "Åtgärd: koppla och ange din .myshopify.com-butiksdomän."
              : `Åtgärd: lägg till ${readiness.credentialHint} under Kopplingar → MCP.`}
        </p>
      ) : readiness.status === "auth_expired" || readiness.status === "missing_credential" ? (
        <p className="mt-1 text-[11px] leading-snug">
          Åtgärd: koppla om {readiness.label} under Kopplingar → MCP och verifiera autentiseringsuppgifter.
        </p>
      ) : null}
    </div>
  );
}
