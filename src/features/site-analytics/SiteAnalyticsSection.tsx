import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, Globe2, Loader2, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatNumber, formatShortDate } from "@/lib/format";
import { buildTrackingSnippet } from "./siteAnalyticsService";
import { useTrackingSite, useTrackingSummary } from "./useSiteAnalytics";

const visitorsChartConfig: ChartConfig = {
  pageviews: {
    label: "Sidvisningar",
    color: "hsl(var(--info))",
  },
  visitors: {
    label: "Besökare",
    color: "hsl(var(--success))",
  },
};

function formatChartDate(iso: string): string {
  return formatShortDate(`${iso}T00:00:00`) || iso;
}

function SnippetBlock({ siteKey }: { siteKey: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = buildTrackingSnippet(siteKey);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kunde inte kopiera — markera och kopiera manuellt.");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Spårningskod</p>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => void copy()}>
          {copied ? <Check className="h-3 w-3 mr-1 text-success" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Kopierad" : "Kopiera"}
        </Button>
      </div>
      <pre className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
        {snippet}
      </pre>
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        Klistra in före <code>&lt;/head&gt;</code> på din webbplats. Spårningen är cookiefri och
        lagrar aldrig IP eller user-agent — besökare räknas via en hash som roterar varje dygn.
      </p>
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="relative rounded-md border border-border/50 px-2.5 py-1.5 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-info/10"
              style={{ width: `${(row.count / max) * 100}%` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{row.label}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">{formatNumber(row.count)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Webbplats" section for the Insights page: activate the first-party
 * tracking snippet, show it for copy-paste, and render the visitor stats once
 * beacons start arriving. Hidden entirely without an active business profile.
 */
export function SiteAnalyticsSection({ businessProfileId }: { businessProfileId: string | null }) {
  const { site, isLoading: siteLoading, create, isCreating } = useTrackingSite(businessProfileId);
  const { summary } = useTrackingSummary(site?.siteKey ? businessProfileId : null, 30);
  const [snippetOpen, setSnippetOpen] = useState(false);

  if (!businessProfileId || siteLoading) return null;

  async function activate() {
    try {
      await create({});
      toast.success("Besöksspårning aktiverad — klistra in koden på din webbplats.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte aktivera besöksspårning.");
    }
  }

  const hasData = (summary?.totals.pageviews ?? 0) > 0;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-info" aria-hidden />
              Besökare på webbplatsen
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {hasData && summary
                ? `${formatNumber(summary.totals.visitors)} besökare · ${formatNumber(summary.totals.pageviews)} sidvisningar senaste ${summary.windowDays} dagarna`
                : "Cookiefri, egenhostad spårning — inga externa verktyg."}
            </CardDescription>
          </div>
          {site?.siteKey ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setSnippetOpen((v) => !v)}
            >
              {snippetOpen ? "Dölj spårningskod" : "Visa spårningskod"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!site?.siteKey ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-6 text-center space-y-3">
            <Eye className="h-8 w-8 text-muted-foreground/40 mx-auto" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Ingen besöksspårning ännu.</p>
              <p className="text-xs text-muted-foreground/80 max-w-sm mx-auto leading-relaxed">
                Aktivera för att få en spårningskod att lägga på företagets webbplats — besökare,
                sidvisningar, toppsidor och trafikkällor hamnar här.
              </p>
            </div>
            <Button type="button" size="sm" disabled={isCreating} onClick={() => void activate()}>
              {isCreating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Aktivera besöksspårning
            </Button>
          </div>
        ) : (
          <>
            {(snippetOpen || !hasData) ? <SnippetBlock siteKey={site.siteKey} /> : null}

            {hasData && summary ? (
              <>
                <ChartContainer config={visitorsChartConfig} className="aspect-[16/9] sm:aspect-[16/5] w-full">
                  <AreaChart data={summary.byDay} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="siteVisitsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-pageviews)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--color-pageviews)" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent labelFormatter={(value: string) => formatChartDate(value)} />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="pageviews"
                      stroke="var(--color-pageviews)"
                      strokeWidth={2}
                      fill="url(#siteVisitsFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stroke="var(--color-visitors)"
                      strokeWidth={2}
                      fill="transparent"
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>

                <div className={cn("grid gap-4", summary.topReferrers.length > 0 ? "sm:grid-cols-2" : "grid-cols-1")}>
                  <TopList
                    title="Toppsidor"
                    rows={summary.topPages.map((p) => ({ label: p.path, count: p.pageviews }))}
                  />
                  <TopList
                    title="Trafikkällor"
                    rows={summary.topReferrers.map((r) => ({ label: r.host, count: r.pageviews }))}
                  />
                </div>

                {summary.devices.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3 w-3" aria-hidden />
                    {summary.devices
                      .map((d) => {
                        const label =
                          d.device === "mobile" ? "Mobil" : d.device === "tablet" ? "Surfplatta" : "Desktop";
                        return `${label} ${Math.round((d.pageviews / Math.max(1, summary.totals.pageviews)) * 100)}%`;
                      })
                      .join(" · ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/70 px-3 py-2.5">
                Väntar på första besöket — statistiken dyker upp här så fort koden ligger på webbplatsen.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
