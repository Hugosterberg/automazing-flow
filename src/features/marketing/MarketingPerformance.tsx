import { Gauge, Info, Minus, Plug, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMarketingCampaigns, type MarketingPerformance as Performance } from "./useMarketingCampaigns";
import { useMarketingTrend } from "./useMarketingTrend";
import { formatMoney, formatNumber, formatPct, formatRoas } from "./format";
import { MarketingGradeBadge, portfolioGradeTone } from "./MarketingGradeBadge";
import { MarketingRecommendations } from "./MarketingRecommendations";

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** Week-over-week trend strip, shown once there's a baseline ~7 days back. */
function TrendStrip() {
  const { trend } = useMarketingTrend();
  if (!trend || !trend.previous || trend.roasDelta == null) return null;
  const Icon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  const tone =
    trend.direction === "up" ? "text-success" : trend.direction === "down" ? "text-destructive" : "text-muted-foreground";
  const delta = `${trend.roasDelta > 0 ? "+" : ""}${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(trend.roasDelta)}×`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
      <span className={cn("inline-flex items-center gap-1 font-medium", tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        ROAS {delta} vs last week
      </span>
      <span>Spend {pct(trend.spendChangePct)}</span>
      <span>Revenue {pct(trend.revenueChangePct)}</span>
    </div>
  );
}

/**
 * One derived KPI with its calculation shown inline. `formula` is rendered
 * directly under the value so it's always visible exactly how the number was
 * produced — no hidden tooltip.
 */
function MetricTile({
  label,
  value,
  formula,
  tone = "default",
}: {
  label: string;
  value: string;
  formula: React.ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  const valueColor =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", valueColor)}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/90">{formula}</p>
    </div>
  );
}

function adSpendBreakdown(p: Performance): string {
  const parts: string[] = [];
  if (p.adSpendByPlatform.meta_business != null) {
    parts.push(`Meta ${formatMoney(p.adSpendByPlatform.meta_business, p.adSpendCurrency)}`);
  }
  if (p.adSpendByPlatform.google_ads != null) {
    parts.push(`Google ${formatMoney(p.adSpendByPlatform.google_ads, p.adSpendCurrency)}`);
  }
  return parts.join(" + ");
}

const CHANNEL_META: Array<{ key: "meta_business" | "google_ads"; label: string; bar: string; dot: string }> = [
  { key: "meta_business", label: "Meta", bar: "bg-primary", dot: "bg-primary" },
  { key: "google_ads", label: "Google", bar: "bg-info", dot: "bg-info" },
];

/**
 * Channel mix — each ad platform's share of total spend. Share is shown next
 * to the amount so the split is self-explanatory (share = platform spend ÷
 * total ad spend).
 */
function ChannelMix({ performance: p }: { performance: Performance }) {
  const total = p.adSpend ?? 0;
  if (total <= 0) return null;
  const channels = CHANNEL_META.map((c) => ({
    ...c,
    value: p.adSpendByPlatform[c.key],
  })).filter((c): c is typeof c & { value: number } => c.value != null && c.value > 0);
  if (channels.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Kanalmix (andel av annonsspend)</p>
        <p className="text-[11px] text-muted-foreground">andel = kanalens spend ÷ {formatMoney(total, p.adSpendCurrency)}</p>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {channels.map((c) => (
          <div key={c.key} className={cn("h-full", c.bar)} style={{ width: `${(c.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {channels.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", c.dot)} aria-hidden />
            {c.label} {Math.round((c.value / total) * 100)}% · {formatMoney(c.value, p.adSpendCurrency)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MarketingPerformance() {
  const { performance, connected, analytics, isLoading } = useMarketingCampaigns();

  if (isLoading && !performance) {
    return (
      <Card className="border-border border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading marketing data…</CardContent>
      </Card>
    );
  }

  if (!performance) {
    return (
      <Card className="border-border border-dashed bg-muted/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Marknadsföringsresultat
          </CardTitle>
          <CardDescription>Connect Shopify and at least one ad platform to see ROAS here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!connected.shopify ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/ecommerce">Connect Shopify</Link>
            </Button>
          ) : null}
          {!connected.meta_business && !connected.google_ads ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/connections">Connect ads</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <a href="#paid-ads">
              <Plug className="h-3.5 w-3.5 mr-1.5" />
              Set up paid ads
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const p = performance;
  const hasAdSpend = p.adSpend != null;
  const hasRevenue = p.revenue != null;
  if (!hasAdSpend && !hasRevenue) {
    return (
      <Card className="border-border border-dashed bg-muted/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Marknadsföringsresultat
          </CardTitle>
          <CardDescription>
            {connected.shopify ? "Shopify connected — waiting for ad spend data." : "Connect Shopify for revenue side of ROAS."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!connected.shopify ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/ecommerce">Connect Shopify</Link>
            </Button>
          ) : null}
          {!connected.meta_business && !connected.google_ads ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/connections">Connect Meta or Google Ads</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const moneySpend = formatMoney(p.adSpend, p.adSpendCurrency);
  const moneyRevenue = formatMoney(p.revenue, p.revenueCurrency);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          Marknadsföringsresultat
        </CardTitle>
        <CardDescription>
          Annonsspend och butiksintäkter kopplade ihop · senaste {p.windowDays} dagarna
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {analytics && analytics.portfolioGrade !== "—" ? (
          <div
            className={cn(
              "flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3",
              portfolioGradeTone(analytics.portfolioGrade) === "good"
                ? "border-success/30 bg-success/5"
                : portfolioGradeTone(analytics.portfolioGrade) === "bad"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border bg-muted/20",
            )}
          >
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Marknadsföringsbetyg · senaste {p.windowDays} dagar</p>
              <div className="flex flex-wrap items-center gap-2">
                <MarketingGradeBadge
                  grade={analytics.portfolioGrade}
                  label={analytics.portfolioLabel}
                  score={analytics.portfolioScore}
                  size="lg"
                  showScore
                />
                <span className="text-sm font-medium text-foreground">{analytics.portfolioLabel}</span>
              </div>
              {analytics.portfolioReasons.length > 0 ? (
                <ul className="text-[11px] text-muted-foreground space-y-0.5 mt-1">
                  {analytics.portfolioReasons.map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="text-right text-[11px] text-muted-foreground tabular-nums">
              <p>
                {analytics.campaignsGood} bra · {analytics.campaignsOk} godkända ·{" "}
                <span className={analytics.campaignsPoor > 0 ? "text-destructive font-medium" : ""}>
                  {analytics.campaignsPoor} svaga
                </span>
              </p>
              {analytics.platformScores.meta_business ? (
                <p>Meta {analytics.platformScores.meta_business.grade} · Google{" "}
                  {analytics.platformScores.google_ads?.grade ?? "—"}</p>
              ) : analytics.platformScores.google_ads ? (
                <p>Google {analytics.platformScores.google_ads.grade}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="ROAS"
            value={formatRoas(p.roas)}
            tone={p.roas == null ? "default" : p.roas >= 1 ? "good" : "bad"}
            formula={
              p.roas != null ? (
                <>Intäkter {moneyRevenue} ÷ annonsspend {moneySpend}</>
              ) : !hasRevenue ? (
                "Anslut Shopify för att beräkna ROAS"
              ) : (
                "Anslut Meta/Google Ads för att beräkna ROAS"
              )
            }
          />
          <MetricTile
            label="Kostnad per order"
            value={p.costPerOrder != null ? formatMoney(p.costPerOrder, p.adSpendCurrency) : "—"}
            formula={
              p.costPerOrder != null ? (
                <>Annonsspend {moneySpend} ÷ {formatNumber(p.orders)} ordrar</>
              ) : !hasAdSpend ? (
                "Kräver annonsspend"
              ) : (
                "Kräver Shopify-ordrar"
              )
            }
          />
          <MetricTile
            label="Annonsspend"
            value={moneySpend}
            formula={hasAdSpend ? adSpendBreakdown(p) || "Summa aktiva kampanjer" : "Ingen annons­plattform ansluten"}
          />
          <MetricTile
            label="Intäkter"
            value={moneyRevenue}
            formula={
              hasRevenue ? (
                <>Shopify brutto · {formatNumber(p.orders)} ordrar · ⌀ {formatMoney(p.averageOrderValue, p.revenueCurrency)}</>
              ) : (
                "Ingen Shopify-butik ansluten"
              )
            }
          />
        </div>

        {analytics && (analytics.blendedCtr != null || analytics.blendedCpc != null) ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricTile
              label="CTR (snitt)"
              value={formatPct(analytics.blendedCtr)}
              formula={
                analytics.blendedCtr != null ? (
                  <>
                    {formatNumber(analytics.totalClicks)} klick ÷ {formatNumber(analytics.totalImpressions)} visningar
                  </>
                ) : (
                  "Kräver impressions från Meta/Google"
                )
              }
            />
            <MetricTile
              label="CPC (snitt)"
              value={formatMoney(analytics.blendedCpc, p.adSpendCurrency)}
              formula={
                analytics.blendedCpc != null ? (
                  <>
                    {formatMoney(p.adSpend, p.adSpendCurrency)} ÷ {formatNumber(analytics.totalClicks)} klick
                  </>
                ) : (
                  "Kräver klickdata"
                )
              }
            />
            <MetricTile
              label="CPM (snitt)"
              value={formatMoney(analytics.blendedCpm, p.adSpendCurrency)}
              formula={
                analytics.blendedCpm != null ? (
                  <>
                    {formatMoney(p.adSpend, p.adSpendCurrency)} ÷ {formatNumber(analytics.totalImpressions)} visningar ×
                    1000
                  </>
                ) : (
                  "Kräver impressions"
                )
              }
            />
            <MetricTile
              label="Konverteringsgrad"
              value={formatPct(analytics.blendedConversionRate)}
              formula={
                analytics.blendedConversionRate != null ? (
                  <>
                    {formatNumber(analytics.totalConversions)} konv. ÷ {formatNumber(analytics.totalClicks)} klick
                  </>
                ) : (
                  "Kräver conversions från Meta/Google"
                )
              }
            />
            <MetricTile
              label="Kostnad per konv."
              value={formatMoney(analytics.blendedCostPerConversion, p.adSpendCurrency)}
              formula={
                analytics.blendedCostPerConversion != null ? (
                  <>
                    {formatMoney(p.adSpend, p.adSpendCurrency)} ÷ {formatNumber(analytics.totalConversions)} konv.
                  </>
                ) : (
                  "Kräver konverteringsdata"
                )
              }
            />
          </div>
        ) : null}

        {analytics?.recommendations?.length ? (
          <MarketingRecommendations recommendations={analytics.recommendations} />
        ) : null}

        <TrendStrip />

        {hasAdSpend ? <ChannelMix performance={p} /> : null}

        <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
          <span>
            <TrendingUp className="inline h-3 w-3 mr-1 align-[-1px]" aria-hidden />
            Källor: annonsspend från Meta &amp; Google Ads, intäkter från Shopify (bruttoförsäljning, exkl. avbrutna
            ordrar). Alla siffror avser samma {p.windowDays}-dagarsfönster.
            {p.currencyMismatch
              ? " Obs: annonsspend och intäkter rapporteras i olika valutor — ROAS är ungefärlig."
              : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
