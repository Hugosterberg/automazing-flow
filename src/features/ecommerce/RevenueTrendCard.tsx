import { m } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/format";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatChartDate, type RevenuePoint } from "./ecommerceOrg";

type Props = {
  revenueTrend: RevenuePoint[];
  revenue30d: number;
  currency: string;
};

/** Shopify 30-day revenue area chart for the ecommerce Insights tab. */
export function RevenueTrendCard({ revenueTrend, revenue30d, currency }: Props) {
  const { t } = useTranslation("ecommerce");

  const revenueChartConfig: ChartConfig = {
    revenue: {
      label: t("revenueChart.label"),
      color: "hsl(var(--primary, 142 76% 36%))",
    },
  };

  if (revenueTrend.length === 0) return null;

  return (
    <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
      <Card className="bg-card border-border glow-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            {t("revenueChart.title")}
          </CardTitle>
          <CardDescription>
            {t("revenueChart.description", {
              total: formatCurrency(revenue30d, currency, { detailed: true }),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={revenueChartConfig} className="aspect-[16/5] w-full">
            <AreaChart data={revenueTrend} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="shopifyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatChartDate(value)}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(value: number) => formatCurrency(value, currency)}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatChartDate(String(value))}
                    formatter={(value) => formatCurrency(Number(value), currency, { detailed: true })}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-revenue)"
                fill="url(#shopifyRevenueFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </m.div>
  );
}
