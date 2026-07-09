import { useEffect, useState } from "react";
import { Coins, Loader2, Sparkles, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fetchAiUsage, type AiUsageSummary } from "./aiUsageClient";

function formatUsd(value: number): string {
  if (value <= 0) return "$0.00";
  if (value < 0.01) return "< $0.01";
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function kindLabel(kind: string): string {
  if (kind === "openai") return "OpenAI";
  if (kind === "mcp") return "MCP";
  if (kind === "apiai") return "apiai.me";
  return kind;
}

/** Shows estimated AI/MCP spend and which tools were selected per run. */
export function AiUsagePanel({
  businessProfileId,
  className,
}: {
  businessProfileId: string | null;
  className?: string;
}) {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessProfileId) {
      setSummary(null);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    fetchAiUsage(businessProfileId, 30)
      .then((data) => {
        if (!ignore) setSummary(data);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : "Kunde inte ladda kostnader.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [businessProfileId]);

  const maxFeatureUsd = Math.max(...(summary?.byFeature.map((f) => f.estimatedUsd) ?? [0]), 0.0001);

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-amber-500" />
          AI-kostnader & verktygsval
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          Uppskattad kostnad senaste 30 dagarna. MCP-verktyg väljs dynamiskt per körning — här ser du
          vad som användes och varför.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!businessProfileId ? (
          <p className="text-sm text-muted-foreground">Välj en bolagsprofil för att se kostnader.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar kostnadsdata…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !summary || summary.totals.eventCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga AI- eller MCP-anrop spårade än. Kör t.ex. task-assist, lead-research eller
            company-enrich så dyker kostnad och verktygsval upp här.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Uppskattat totalt</p>
                <p className="text-lg font-semibold tabular-nums">{formatUsd(summary.totals.estimatedUsd)}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">OpenAI-anrop</p>
                <p className="text-lg font-semibold tabular-nums">{summary.totals.openaiCalls}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatTokens(summary.totals.promptTokens + summary.totals.completionTokens)} tokens
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">MCP-anrop</p>
                <p className="text-lg font-semibold tabular-nums">{summary.totals.mcpCalls}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Händelser</p>
                <p className="text-lg font-semibold tabular-nums">{summary.totals.eventCount}</p>
              </div>
            </div>

            {summary.byFeature.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Per funktion
                </p>
                <ul className="space-y-2">
                  {summary.byFeature.slice(0, 6).map((row) => (
                    <li key={row.featureId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium truncate">{row.label}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {formatUsd(row.estimatedUsd)}
                          {row.mcpCalls > 0 ? ` · ${row.mcpCalls} MCP` : ""}
                          {row.tokens > 0 ? ` · ${formatTokens(row.tokens)} tok` : ""}
                        </span>
                      </div>
                      <Progress value={(row.estimatedUsd / maxFeatureUsd) * 100} className="h-1" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.recent.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  Senaste körningar
                </p>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
                  {summary.recent.slice(0, 8).map((row) => (
                    <li key={row.id} className="px-3 py-2.5 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{row.featureLabel}</span>
                        <Badge variant="outline" className="text-[10px] h-5">
                          {kindLabel(row.kind)}
                        </Badge>
                        {row.provider ? (
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {row.provider}
                          </Badge>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                          {formatUsd(row.estimatedUsd)}
                        </span>
                      </div>
                      {row.selectionReason ? (
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{row.selectionReason}</p>
                      ) : null}
                      {row.queryPreview ? (
                        <p className="text-[10px] text-muted-foreground/80 truncate" title={row.queryPreview}>
                          “{row.queryPreview}”
                        </p>
                      ) : null}
                      {row.toolsSelected.length > 0 ? (
                        <p className="text-[10px] text-muted-foreground/70">
                          Verktyg: {row.toolsSelected.join(", ")}
                          {row.toolName ? ` → ${row.toolName}` : ""}
                        </p>
                      ) : row.toolName ? (
                        <p className="text-[10px] text-muted-foreground/70">Verktyg: {row.toolName}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
              OpenAI-kostnader är uppskattningar från token-räkning. MCP-anrop har en flat
              uppskattning per verktygsanrop tills leverantörer exponerar faktisk kostnad.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
