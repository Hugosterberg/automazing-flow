import { Gauge, Info, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMarketingCampaigns, type MarketingPerformance as Performance } from "./useMarketingCampaigns";
import { formatMoney, formatNumber, formatRoas } from "./format";

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
  const { performance, isLoading } = useMarketingCampaigns();

  // Render only once there's something to relate. Without ad spend AND without
  // revenue there's no cross-source metric to show.
  if (isLoading && !performance) return null;
  if (!performance) return null;
  const p = performance;
  const hasAdSpend = p.adSpend != null;
  const hasRevenue = p.revenue != null;
  if (!hasAdSpend && !hasRevenue) return null;

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
