import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMcpProvidersStatus, mcpStatusLabel } from "./useMcpProvidersStatus";
import { fetchMcpProvidersStatus, type McpProviderReadiness } from "./intelligenceService";

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

function mcpFixHint(provider: McpProviderReadiness): string | null {
  if (provider.status === "ready") return null;
  if (provider.message) return provider.message;
  if (provider.status === "not_connected") {
    if (provider.auth === "oauth") return "Koppla via OAuth under Kopplingar → MCP.";
    if (provider.auth === "api_key") return `Lägg till autentisering: ${provider.credentialHint}`;
    if (provider.auth === "shop_domain") return "Koppla och ange din .myshopify.com-butiksdomän.";
    return "Koppla den här leverantören under Kopplingar → MCP.";
  }
  return provider.credentialHint || "Åtgärda autentisering under Kopplingar → MCP.";
}

/** Read-only list of all MCP providers and readiness — shared by Connections and Intelligence hub. */
export function McpProviderStatusList({ businessProfileId }: { businessProfileId: string | null }) {
  const { providers, isLoading, refetch } = useMcpProvidersStatus(businessProfileId);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const needsAttention = providers.filter(
    (p) => p.status === "missing_credential" || p.status === "auth_expired" || p.status === "error"
  );

  async function testProvider(platform: string) {
    setTestingPlatform(platform);
    try {
      const result = await fetchMcpProvidersStatus(businessProfileId, { probe: true, platform });
      const provider = result.providers.find((p) => p.platform === platform);
      if (!provider) {
        toast.error("Leverantören hittades inte");
        return;
      }
      if (provider.status === "ready") {
        toast.success(`${provider.label} OK`, {
          description:
            provider.toolCount != null
              ? `Live-testet lyckades (${provider.toolCount} verktyg tillgängliga).`
              : "Uppgifterna verifierades.",
        });
      } else {
        toast.error(`${provider.label} behöver uppmärksamhet`, {
          description: mcpFixHint(provider) ?? "Åtgärda uppgifterna under Kopplingar.",
        });
      }
      void refetch();
    } catch (err) {
      toast.error("Leverantörstestet misslyckades", {
        description: err instanceof Error ? err.message : "Kunde inte testa leverantören.",
      });
    } finally {
      setTestingPlatform(null);
    }
  }

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
            <div className="min-w-0 space-y-0.5 flex-1">
              <div className="flex items-center gap-2 font-medium">
                <StatusIcon status={p.status} />
                {p.label}
              </div>
              {p.usedBy.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">Used by: {p.usedBy.join(" · ")}</p>
              ) : null}
              {mcpFixHint(p) && p.status !== "ready" ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{mcpFixHint(p)}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {p.status !== "not_connected" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] gap-1"
                  disabled={testingPlatform === p.platform}
                  onClick={() => void testProvider(p.platform)}
                >
                  {testingPlatform === p.platform ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <PlugZap className="h-3 w-3" />
                  )}
                  Test
                </Button>
              ) : null}
              <Badge variant={statusBadgeVariant(p.status)}>{mcpStatusLabel(p.status)}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
