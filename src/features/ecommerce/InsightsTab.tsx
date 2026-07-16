import { m } from "framer-motion";
import {
  Package,
  TrendingUp,
  DollarSign,
  Users,
  Tag,
  Box,
  ArrowUpRight,
} from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueTrendCard } from "@/features/ecommerce/RevenueTrendCard";
import { formatCurrency, formatNumber } from "@/lib/format";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatPromoValue } from "@/features/ecommerce/orderDisplay";
import { formatDate, type ShopifyData, type TopCustomer } from "@/features/ecommerce/ecommerceOrg";
import type { LeadInput } from "@/features/leads";
import { toast } from "sonner";

type Props = {
  shopifyData: ShopifyData;
  currency: string;
  onCreateLead: (input: LeadInput) => Promise<unknown>;
};

/** Insights stats, revenue trend, topsäljare/toppkunder, and promotions for the Insikter tab. */
export function InsightsTab({ shopifyData, currency, onCreateLead }: Props) {
  const stats = shopifyData.stats;

  const statCards = useMemo(
    () => [
      {
        label: "Intäkter (30 dagar)",
        value: formatCurrency(stats.revenue30d, currency),
        icon: DollarSign,
        sub: `${formatNumber(stats.ordersWindow)} ordrar i perioden`,
      },
      {
        label: "Snittordervärde",
        value: formatCurrency(stats.avgOrderValue, currency),
        icon: TrendingUp,
        sub: stats.fulfillmentRate30d != null ? `${stats.fulfillmentRate30d}% levererade` : "—",
      },
      {
        label: "Kunder",
        value: formatNumber(stats.customersCount),
        icon: Users,
        sub: `+${formatNumber(stats.newCustomers30d)} nya på 30 dagar`,
      },
      {
        label: "Produkter",
        value: formatNumber(stats.productsCount),
        icon: Package,
        sub:
          stats.lowStockCount > 0
            ? `${stats.lowStockCount} variant${stats.lowStockCount === 1 ? "" : "er"} med lågt lager`
            : "Lagret ser bra ut",
      },
    ],
    [stats, currency]
  );

  function handleAddLead(customer: TopCustomer) {
    void onCreateLead({
      company: customer.name,
      contactName: customer.name,
      email: customer.email,
      source: "shopify-customer",
      status: "qualified",
      notes: `Totalt spenderat: ${formatCurrency(customer.totalSpent, customer.currency || currency)} · ${customer.ordersCount} ordrar`,
    }).then(() => toast.success("Tillagd i leads"));
  }

  return (
    <>
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <m.div key={card.label} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.07 }} className="h-full">
            <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300 h-full">
              <CardContent className="p-5 h-full min-h-[168px] flex flex-col" data-ecom-stat-card data-stat-label={card.label}>
                <div className="flex items-center justify-between mb-3">
                  <card.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-xs text-muted-foreground/60 mt-auto pt-2">{card.sub}</p>
              </CardContent>
            </Card>
          </m.div>
        ))}
      </div>

      <RevenueTrendCard
        revenueTrend={shopifyData.revenueTrend}
        revenue30d={shopifyData.stats.revenue30d}
        currency={currency}
      />

      {/* Insight row: top products + top customers */}
      {(shopifyData.topProducts.length > 0 || shopifyData.topCustomers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shopifyData.topProducts.length > 0 && (
            <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Box className="h-5 w-5" />
                    Toppsäljare
                  </CardTitle>
                  <CardDescription>Efter intäkt, senaste 30 dagarna</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {shopifyData.topProducts.map((product, i) => (
                    <div
                      key={`${product.productId ?? product.title}-${i}`}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{product.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(product.quantity)} sålda
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(product.revenue, currency)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </m.div>
          )}

          {shopifyData.topCustomers.length > 0 && (
            <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.25 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5" />
                    Toppkunder
                  </CardTitle>
                  <CardDescription>Efter totalt spenderat</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {shopifyData.topCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{customer.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {customer.email || `${customer.ordersCount} ordrar`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(customer.totalSpent, customer.currency || currency)}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => handleAddLead(customer)}
                        >
                          Lägg till lead
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </m.div>
          )}
        </div>
      )}

      {/* Active promotions */}
      {shopifyData.promotions.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="h-5 w-5" />
                    Aktiva kampanjer
                  </CardTitle>
                  <CardDescription>{shopifyData.stats.activePromotions} aktiva prisregler</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href={shopifyData.adminLinks.discounts} target="_blank" rel="noreferrer" className="text-muted-foreground">
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {shopifyData.promotions.map((promo) => (
                <div
                  key={promo.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{promo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {promo.targetType || "order"} · använd {formatNumber(promo.usageCount)} {promo.usageCount === 1 ? "gång" : "gånger"}
                      {promo.endsAt ? ` · slutar ${formatDate(promo.endsAt)}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-green-600">
                    {formatPromoValue(promo.value, promo.valueType, currency)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </m.div>
      )}
    </>
  );
}
