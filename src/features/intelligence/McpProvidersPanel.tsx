import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMcpProvidersStatus, mcpStatusLabel } from "./useMcpProvidersStatus";
import { searchDocs, lookupDomain, searchArchitectureDocs, runContextQuery } from "./intelligenceService";
import { McpQueryBox } from "./McpQueryBox";
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

/**
 * Overview of all Intelligence & MCP providers — connection state and whether
 * credentials are present enough to make tool calls.
 */
export function McpProvidersPanel({ businessProfileId }: { businessProfileId: string | null }) {
  const { providers, isLoading, refetch } = useMcpProvidersStatus(businessProfileId);
  const [docQuery, setDocQuery] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [docResult, setDocResult] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const usedProviders = providers.filter((p) => p.usedBy.length > 0);
  const needsAttention = providers.filter(
    (p) => p.status === "missing_credential" || p.status === "auth_expired" || p.status === "error"
  );

  async function runDocSearch() {
    const q = docQuery.trim();
    if (!q) return;
    setDocLoading(true);
    setDocError(null);
    setDocResult(null);
    try {
      const result = await searchDocs({ businessProfileId, query: q });
      setDocResult(result.text);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setDocLoading(false);
    }
  }

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">MCP provider status</CardTitle>
            <CardDescription className="text-xs mt-1">
              Shows whether each data provider is connected and has credentials to make API calls.
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        {needsAttention.length > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">
            {needsAttention.length} provider{needsAttention.length === 1 ? "" : "s"} need attention before features can call them.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading provider status…
          </p>
        ) : (
          <ul className="space-y-2">
            {(usedProviders.length > 0 ? usedProviders : providers).map((p) => (
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
        )}

        <div className="rounded-md border border-dashed border-border/80 p-3 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1.5">
            Doc search (Twilio Docs MCP or Exa)
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={docQuery}
              onChange={(e) => setDocQuery(e.target.value)}
              placeholder="e.g. How do I send SMS with Twilio?"
              className="max-w-md text-sm"
              onKeyDown={(e) => e.key === "Enter" && void runDocSearch()}
            />
            <Button type="button" size="sm" disabled={docLoading || !docQuery.trim()} onClick={() => void runDocSearch()}>
              {docLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
          {docError ? <p className="text-xs text-destructive">{docError}</p> : null}
          {docResult ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs text-muted-foreground font-sans">
              {docResult}
            </pre>
          ) : null}
        </div>

        <McpQueryBox
          businessProfileId={businessProfileId}
          platforms={["godaddy"]}
          title="Domain lookup (GoDaddy)"
          placeholder="e.g. automazing.life"
          buttonLabel="Lookup"
          onQuery={(domain) => lookupDomain({ businessProfileId, domain })}
        />
        <McpQueryBox
          businessProfileId={businessProfileId}
          platforms={["klarity"]}
          title="Architecture docs (Klarity)"
          placeholder="e.g. event-driven order pipeline"
          buttonLabel="Search"
          onQuery={(q) => searchArchitectureDocs({ businessProfileId, query: q })}
        />
        <McpQueryBox
          businessProfileId={businessProfileId}
          platforms={["era"]}
          title="Context tools (Era MCP)"
          placeholder="e.g. summarize connected integrations"
          buttonLabel="Query"
          onQuery={(q) => runContextQuery({ businessProfileId, query: q })}
        />

        <p className="text-[11px] text-muted-foreground">
          Connect providers below. Keyed providers need an API key at connect time — without it, calls will fail with{" "}
          <span className="font-medium">Key missing</span>.
        </p>
      </CardContent>
    </Card>
  );
}

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
