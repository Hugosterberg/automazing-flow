import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useMarketingTrend } from "./useMarketingTrend";
import { formatMoney } from "./format";
import { formatNumber, formatShortDate } from "@/lib/format";

function formatChartDate(iso: string): string {
  return formatShortDate(`${iso}T00:00:00`) || iso;
}

/** Compact axis money ("12k" instead of "12 345,00 kr") to keep the axis quiet. */
function formatAxisMoney(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

/**
 * Daily marketing history from marketing_snapshots as two single-axis panels:
 * money (spend + revenue) on top, ROAS below with a 1× break-even line. Two
 * panels instead of a dual-axis chart on purpose — kr and × don't share a scale.
 * Renders nothing until the snapshot cron has at least two days of history.
 */
export function MarketingTrendChart() {
  const { t } = useTranslation("marketing");
  const { snapshots } = useMarketingTrend();

  const moneyChartConfig: ChartConfig = useMemo(
    () => ({
      revenue: {
        label: t("trendChart.revenue"),
        color: "hsl(var(--success))",
      },
      adSpend: {
        label: t("trendChart.adSpend"),
        color: "hsl(var(--info))",
      },
    }),
    [t],
  );

  const roasChartConfig: ChartConfig = useMemo(
    () => ({
      roas: {
        label: t("trendChart.roas"),
        color: "hsl(var(--primary))",
      },
    }),
    [t],
  );

  const ordersChartConfig: ChartConfig = useMemo(
    () => ({
      orders: {
        label: t("trendChart.orders"),
        color: "hsl(var(--info))",
      },
    }),
    [t],
  );

  const series = useMemo(
    () =>
      [...snapshots]
        .filter((s) => s.snapshotDate)
        .sort((a, b) => Date.parse(a.snapshotDate) - Date.parse(b.snapshotDate))
        .map((s) => ({
          date: s.snapshotDate,
          adSpend: s.adSpend,
          revenue: s.revenue,
          roas: s.roas,
          orders: s.orders,
        })),
    [snapshots],
  );

  if (series.length < 2) return null;

  const currency = snapshots[0]?.currency ?? null;
  const hasMoney = series.some((s) => s.adSpend != null || s.revenue != null);
  const hasRoas = series.some((s) => s.roas != null);
  const hasOrders = series.some((s) => s.orders != null);
  if (!hasMoney && !hasRoas && !hasOrders) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        {t("trendChart.title", { days: series.length })}
      </p>

      {hasMoney ? (
        <ChartContainer config={moneyChartConfig} className="aspect-[16/9] sm:aspect-[16/5] w-full">
          <LineChart data={series} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis tickFormatter={formatAxisMoney} tickLine={false} axisLine={false} width={44} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value: string) => formatChartDate(value)}
                  formatter={(value, name, item) => (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {moneyChartConfig[name as keyof typeof moneyChartConfig]?.label ?? name}
                      </span>
                      <span className="font-mono font-medium tabular-nums" style={{ color: item?.color }}>
                        {formatMoney(Number(value), currency)}
                      </span>
                    </span>
                  )}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="adSpend"
              stroke="var(--color-adSpend)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      ) : null}

      {hasOrders ? (
        <ChartContainer config={ordersChartConfig} className="aspect-[16/6] sm:aspect-[16/3] w-full">
          <LineChart data={series} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value: string) => formatChartDate(value)}
                  formatter={(value) => (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("trendChart.ordersTooltip")}</span>
                      <span className="font-mono font-medium tabular-nums">{formatNumber(Number(value))}</span>
                    </span>
                  )}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="orders"
              stroke="var(--color-orders)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      ) : null}

      {hasRoas ? (
        <ChartContainer config={roasChartConfig} className="aspect-[16/6] sm:aspect-[16/3] w-full">
          <LineChart data={series} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(value: number) => `${value}×`}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={[0, "auto"]}
            />
            <ReferenceLine y={1} strokeDasharray="4 4" stroke="hsl(var(--warning))" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value: string) => formatChartDate(value)}
                  formatter={(value) => (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("trendChart.roas")}</span>
                      <span className="font-mono font-medium tabular-nums">{Number(value).toFixed(2)}×</span>
                    </span>
                  )}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="roas"
              stroke="var(--color-roas)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      ) : null}
    </div>
  );
}
