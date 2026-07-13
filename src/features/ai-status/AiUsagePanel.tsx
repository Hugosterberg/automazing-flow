import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, RefreshCw, Sparkles, Wrench, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fetchAiUsage, type AiUsageSummary } from "./aiUsageClient";

const dailyCostChartConfig: ChartConfig = {
  estimatedUsd: {
    label: "Kostnad",
    color: "hsl(var(--warning))",
  },
};

function formatChartDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

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

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just nu";
  if (mins < 60) return `${mins} min sedan`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h sedan`;
  const days = Math.floor(hours / 24);
  return `${days} d sedan`;
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Coins;
  accent: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/70 bg-card px-3 py-2.5 relative overflow-hidden")}>
      <div className={cn("absolute inset-y-0 left-0 w-0.5", accent)} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums tracking-tight">{value}</p>
          {hint ? <p className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</p> : null}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" aria-hidden />
      </div>
    </div>
  );
}

/** Estimated AI/MCP spend and per-run tool selection transparency. */
export function AiUsagePanel({
  businessProfileId,
  className,
}: {
  businessProfileId: string | null;
  className?: string;
}) {
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessProfileId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAiUsage(businessProfileId, windowDays);
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ladda kostnader.");
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxFeatureUsd = Math.max(...(summary?.byFeature.map((f) => f.estimatedUsd) ?? [0]), 0.0001);

  return (
    <Card className={cn("bg-card border-border h-full flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-amber-500" />
              Kostnader & verktygsval
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed mt-1">
              Uppskattad spend och vilka MCP:er som valdes per körning.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {([7, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWindowDays(d)}
                  className={cn(
                    "px-2 py-0.5 text-[11px] rounded-sm transition-colors",
                    windowDays === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={loading || !businessProfileId}
              onClick={() => void load()}
              aria-label="Uppdatera kostnadsdata"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        {!businessProfileId ? (
          <p className="text-sm text-muted-foreground">Välj en bolagsprofil för att se kostnader.</p>
        ) : loading && !summary ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar kostnadsdata…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !summary || summary.totals.eventCount === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-6 text-center space-y-2">
            <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">Ingen spårning ännu</p>
            <p className="text-xs text-muted-foreground/80 max-w-xs mx-auto leading-relaxed">
              Kör task-assist, lead-research eller company-enrich — då visas kostnad och
              verktygsval här.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="Uppskattat totalt"
                value={formatUsd(summary.totals.estimatedUsd)}
                icon={Coins}
                accent="bg-amber-500"
              />
              <StatTile
                label="OpenAI"
                value={String(summary.totals.openaiCalls)}
                hint={`${formatTokens(summary.totals.promptTokens + summary.totals.completionTokens)} tokens`}
                icon={Sparkles}
                accent="bg-violet-500"
              />
              <StatTile
                label="MCP-anrop"
                value={String(summary.totals.mcpCalls)}
                icon={Wrench}
                accent="bg-blue-500"
              />
              <StatTile
                label="Händelser"
                value={String(summary.totals.eventCount)}
                hint={`Senaste ${windowDays} dagarna`}
                icon={Zap}
                accent="bg-emerald-500"
              />
            </div>

            {(summary.byDay ?? []).some((d) => d.estimatedUsd > 0) ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">Kostnad per dag</p>
                <ChartContainer config={dailyCostChartConfig} className="aspect-[16/4] w-full">
                  <BarChart data={summary.byDay} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDay}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value: string) => formatChartDay(value)}
                          formatter={(value, _name, item) => (
                            <span className="flex w-full items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                {Number(item?.payload?.eventCount ?? 0)} körningar
                              </span>
                              <span className="font-mono font-medium tabular-nums">
                                {formatUsd(Number(value))}
                              </span>
                            </span>
                          )}
                        />
                      }
                    />
                    <Bar
                      dataKey="estimatedUsd"
                      fill="var(--color-estimatedUsd)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={18}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            ) : null}

            {summary.byFeature.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Per funktion</p>
                <ul className="space-y-2.5">
                  {summary.byFeature.slice(0, 5).map((row) => (
                    <li key={row.featureId}>
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span className="font-medium truncate">{row.label}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0 text-[11px]">
                          {formatUsd(row.estimatedUsd)}
                        </span>
                      </div>
                      <Progress value={(row.estimatedUsd / maxFeatureUsd) * 100} className="h-1" />
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {row.eventCount} körning{row.eventCount === 1 ? "" : "ar"}
                        {row.mcpCalls > 0 ? ` · ${row.mcpCalls} MCP` : ""}
                        {row.tokens > 0 ? ` · ${formatTokens(row.tokens)} tok` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.recent.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Senaste körningar</p>
                <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
                  {summary.recent.slice(0, 6).map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 space-y-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate">{row.featureLabel}</span>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                          {kindLabel(row.kind)}
                        </Badge>
                        {row.provider ? (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                            {row.provider}
                          </Badge>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums shrink-0">
                          {relativeTime(row.createdAt)}
                        </span>
                        <span className="text-[11px] font-medium tabular-nums w-full sm:w-auto sm:ml-auto text-right">
                          {formatUsd(row.estimatedUsd)}
                        </span>
                      </div>
                      {row.selectionReason ? (
                        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                          {row.selectionReason}
                        </p>
                      ) : null}
                      {row.queryPreview ? (
                        <p className="text-[10px] text-muted-foreground/70 truncate" title={row.queryPreview}>
                          {row.queryPreview}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1 border-t border-border/50">
              OpenAI = token-uppskattning. MCP = flat per anrop tills leverantör rapporterar pris.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
