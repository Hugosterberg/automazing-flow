import { m } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Box,
  ChevronRight,
  Megaphone,
  Package,
  ShoppingBag,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RevenueTrendCard } from "@/features/ecommerce/RevenueTrendCard";
import {
  flattenCampaignMetrics,
  OverviewSectionSheet,
} from "@/features/ecommerce/OverviewSectionSheet";
import {
  buildOverviewSignals,
  buildProductRows,
  fulfillmentBreakdown,
  matchesQuery,
  paymentBreakdown,
  shareOfTotal,
  type OverviewSectionId,
  type OverviewSignal,
} from "@/features/ecommerce/overviewInsights";
import { formatDate, type ShopifyData } from "@/features/ecommerce/ecommerceOrg";
import { useMarketingCampaigns } from "@/features/marketing/useMarketingCampaigns";
import {
  fetchFortnoxFinancialSnapshot,
  fetchFortnoxSupplierInvoices,
} from "@/features/economy/economyClient";
import type { ActionNeeded } from "@/features/ecommerce/OrdersTab";
import type { LeadInput } from "@/features/leads";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatNumber } from "@/lib/format";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/ecommerce";
import { AutomationEnableHint } from "@/features/automation";

type Props = {
  shopifyData: ShopifyData | null;
  products: Product[];
  currency: string;
  businessProfileId: string | null;
  actionNeeded?: ActionNeeded | null;
  onOpenTab: (tab: "products" | "orders" | "insights") => void;
  onCreateLead?: (input: LeadInput) => Promise<unknown>;
  onFilterStaleUnfulfilled?: () => void;
  onFilterPendingPayments?: () => void;
  onExportOrders?: () => void;
};

const severityClass: Record<OverviewSignal["severity"], string> = {
  critical: "border-destructive/40 bg-destructive/5 text-destructive",
  warning: "border-warning/40 bg-warning/5 text-warning",
  opportunity: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  info: "border-border/60 bg-muted/20 text-muted-foreground",
};

export function OverviewTab({
  shopifyData,
  products,
  currency,
  businessProfileId,
  actionNeeded = null,
  onOpenTab,
  onCreateLead,
  onFilterStaleUnfulfilled,
  onFilterPendingPayments,
  onExportOrders,
}: Props) {
  const { t } = useTranslation("ecommerce");
  const { enabled } = useAuth();
  const [query, setQuery] = useState("");
  const [detailSection, setDetailSection] = useState<OverviewSectionId | null>(null);
  const q = query.trim().toLowerCase();

  const {
    platforms,
    connected: adsConnected,
    performance,
    analytics,
    isLoading: adsLoading,
  } = useMarketingCampaigns();

  const fortnoxEnabled = Boolean(enabled && businessProfileId);
  const snapshotQuery = useQuery({
    queryKey: ["fortnox-financial-snapshot", businessProfileId],
    queryFn: ({ signal }) => fetchFortnoxFinancialSnapshot(businessProfileId as string, signal),
    enabled: fortnoxEnabled,
    staleTime: 10 * 60 * 1000,
    meta: { silent: true },
  });
  const supplierQuery = useQuery({
    queryKey: ["fortnox-supplier-invoices", businessProfileId],
    queryFn: ({ signal }) => fetchFortnoxSupplierInvoices(businessProfileId as string, signal),
    enabled: fortnoxEnabled,
    staleTime: 10 * 60 * 1000,
    meta: { silent: true },
  });

  const stats = shopifyData?.stats;
  const storeCurrency = stats?.currency || currency;
  const snapshot = snapshotQuery.data?.connected ? snapshotQuery.data.snapshot : undefined;
  const suppliers = supplierQuery.data?.connected ? supplierQuery.data.summary : undefined;
  const purchaseCurrency = snapshot?.currency || suppliers?.currency || storeCurrency;

  const productRows = useMemo(
    () => buildProductRows(products, shopifyData, storeCurrency, q),
    [products, shopifyData, storeCurrency, q]
  );
  const productTotals = useMemo(() => {
    let sold = 0;
    let revenue = 0;
    for (const row of productRows) {
      sold += row.sold;
      revenue += row.revenue;
    }
    return { count: productRows.length, sold, revenue };
  }, [productRows]);

  const customerRows = useMemo(
    () => (shopifyData?.topCustomers ?? []).filter((c) => matchesQuery(`${c.name} ${c.email}`, q)),
    [shopifyData?.topCustomers, q]
  );
  const customerTotals = useMemo(() => {
    let orders = 0;
    let spent = 0;
    for (const c of customerRows) {
      orders += c.ordersCount;
      spent += c.totalSpent;
    }
    return {
      listed: customerRows.length,
      totalCustomers: stats?.customersCount ?? customerRows.length,
      orders,
      spent,
    };
  }, [customerRows, stats?.customersCount]);

  const campaigns = useMemo(() => {
    const rows = [];
    for (const platform of platforms) {
      for (const campaign of platform.campaigns) {
        rows.push(
          flattenCampaignMetrics({
            ...campaign,
            platform: platform.platform,
            accountName: platform.accountName,
            accountCurrency: platform.currency,
          })
        );
      }
    }
    return rows.filter((c) => matchesQuery(`${c.name} ${c.status} ${c.platform} ${c.accountName}`, q));
  }, [platforms, q]);

  const adTotals = useMemo(() => {
    let spend = 0;
    let conversions = 0;
    for (const c of campaigns) {
      spend += c.spend;
      conversions += c.conversions;
    }
    return {
      count: campaigns.length,
      spend: performance?.adSpend ?? spend,
      conversions: analytics?.totalConversions ?? conversions,
      roas: performance?.roas ?? null,
    };
  }, [campaigns, performance, analytics]);

  const orderRows = useMemo(
    () =>
      (shopifyData?.orders ?? []).filter((o) =>
        matchesQuery(`${o.name} ${o.customer || ""} ${o.email} ${o.status} ${o.fulfillment}`, q)
      ),
    [shopifyData?.orders, q]
  );
  const orderTotals = useMemo(() => {
    let sum = 0;
    let items = 0;
    for (const o of orderRows) {
      sum += o.total;
      items += o.lineItemCount;
    }
    return {
      count: orderRows.length,
      sum,
      items,
      windowOrders: stats?.ordersWindow ?? orderRows.length,
      revenue30d: stats?.revenue30d ?? sum,
    };
  }, [orderRows, stats]);

  const fulfillmentMix = useMemo(
    () => fulfillmentBreakdown(shopifyData?.orders ?? []),
    [shopifyData?.orders]
  );
  const paymentMix = useMemo(
    () => paymentBreakdown(shopifyData?.orders ?? []),
    [shopifyData?.orders]
  );
  const ordersForMix = shopifyData?.orders?.length ?? 0;

  const marginPct = useMemo(() => {
    if (!snapshot || !(snapshot.revenue > 0)) return null;
    return Math.round(((snapshot.revenue - snapshot.costs) / snapshot.revenue) * 100);
  }, [snapshot]);

  const pulseStats = useMemo(() => {
    const tiles: Array<{
      id: string;
      section: OverviewSectionId;
      label: string;
      value: string;
      hint?: string;
      show: boolean;
    }> = [
      {
        id: "aov",
        section: "sales",
        label: t("overview.pulse.aov"),
        value: formatCurrency(stats?.avgOrderValue ?? 0, storeCurrency),
        hint: t("overview.pulse.aovHint"),
        show: Boolean(shopifyData),
      },
      {
        id: "fulfillment",
        section: "sales",
        label: t("overview.pulse.fulfillment"),
        value:
          stats?.fulfillmentRate30d != null ? `${stats.fulfillmentRate30d}%` : "—",
        hint: t("overview.pulse.fulfillmentHint"),
        show: Boolean(shopifyData),
      },
      {
        id: "abandoned",
        section: "sales",
        label: t("overview.pulse.abandoned"),
        value: formatNumber(stats?.abandonedCheckouts30d ?? 0),
        hint: formatCurrency(stats?.abandonedValue30d ?? 0, storeCurrency),
        show: Boolean(shopifyData),
      },
      {
        id: "conversion",
        section: "sales",
        label: t("overview.pulse.conversion"),
        value:
          stats?.conversionEstimate30d != null
            ? `${stats.conversionEstimate30d}%`
            : "—",
        hint: t("overview.pulse.conversionHint"),
        show: Boolean(shopifyData),
      },
      {
        id: "promotions",
        section: "sales",
        label: t("overview.pulse.promotions"),
        value: formatNumber(stats?.activePromotions ?? 0),
        hint: t("overview.pulse.promotionsHint"),
        show: Boolean(shopifyData),
      },
      {
        id: "ad-conv",
        section: "ads",
        label: t("overview.pulse.adConversions"),
        value: formatNumber(adTotals.conversions),
        hint:
          performance?.costPerOrder != null
            ? t("overview.pulse.cpo", {
                value: formatCurrency(
                  performance.costPerOrder,
                  performance.adSpendCurrency || storeCurrency
                ),
              })
            : t("overview.pulse.adConversionsHint"),
        show: adsConnected.meta_business || adsConnected.google_ads,
      },
      {
        id: "ad-revenue",
        section: "ads",
        label: t("overview.pulse.adAttributedRevenue"),
        value:
          performance?.revenue != null
            ? formatCurrency(
                performance.revenue,
                performance.revenueCurrency || storeCurrency
              )
            : "—",
        hint:
          performance?.orders != null
            ? t("overview.pulse.adAttributedOrders", { count: performance.orders })
            : undefined,
        show: adsConnected.meta_business || adsConnected.google_ads,
      },
      {
        id: "margin",
        section: "purchases",
        label: t("overview.pulse.margin"),
        value: marginPct != null ? `${marginPct}%` : "—",
        hint: snapshot
          ? formatCurrency(snapshot.resultEstimate, purchaseCurrency)
          : t("overview.kpi.purchasesConnect"),
        show: Boolean(snapshot || suppliers),
      },
      {
        id: "unpaid",
        section: "purchases",
        label: t("overview.pulse.unpaid"),
        value: formatNumber(suppliers?.unpaidCount ?? 0),
        hint: suppliers
          ? formatCurrency(suppliers.unpaidSum, purchaseCurrency)
          : undefined,
        show: Boolean(suppliers),
      },
      {
        id: "product-revenue",
        section: "products",
        label: t("overview.pulse.matchedProductRevenue"),
        value: formatCurrency(productTotals.revenue, storeCurrency),
        hint: t("overview.pulse.matchedProductSold", {
          count: formatNumber(productTotals.sold),
        }),
        show: productTotals.count > 0,
      },
      {
        id: "top-customer-spend",
        section: "customers",
        label: t("overview.pulse.topCustomerSpend"),
        value: formatCurrency(customerTotals.spent, storeCurrency),
        hint: t("overview.pulse.topCustomerOrders", {
          count: formatNumber(customerTotals.orders),
        }),
        show: customerTotals.listed > 0,
      },
    ];
    return tiles.filter((tile) => tile.show);
  }, [
    t,
    stats,
    storeCurrency,
    shopifyData,
    adTotals.conversions,
    performance,
    adsConnected.meta_business,
    adsConnected.google_ads,
    marginPct,
    snapshot,
    suppliers,
    purchaseCurrency,
    productTotals,
    customerTotals,
  ]);

  const supplierRows = useMemo(
    () =>
      (suppliers?.invoices ?? []).filter((inv) =>
        matchesQuery(`${inv.supplierName} ${inv.invoiceNumber}`, q)
      ),
    [suppliers?.invoices, q]
  );

  const signals = useMemo(
    () =>
      buildOverviewSignals({
        shopifyData,
        campaigns,
        portfolioRoas: performance?.roas ?? null,
        suppliers,
        snapshot,
        actionNeeded,
      }),
    [shopifyData, campaigns, performance?.roas, suppliers, snapshot, actionNeeded]
  );

  const sections: Array<{ id: OverviewSectionId; label: string; count: number; metric?: string }> = [
    {
      id: "products",
      label: t("overview.nav.products"),
      count: productTotals.count,
      metric: productTotals.revenue > 0 ? formatCurrency(productTotals.revenue, storeCurrency) : undefined,
    },
    {
      id: "customers",
      label: t("overview.nav.customers"),
      count: customerTotals.totalCustomers,
      metric: customerTotals.spent > 0 ? formatCurrency(customerTotals.spent, storeCurrency) : undefined,
    },
    {
      id: "ads",
      label: t("overview.nav.ads"),
      count: adTotals.count,
      metric:
        adTotals.spend != null
          ? formatCurrency(adTotals.spend, performance?.adSpendCurrency || storeCurrency)
          : undefined,
    },
    {
      id: "sales",
      label: t("overview.nav.sales"),
      count: orderTotals.windowOrders,
      metric: formatCurrency(orderTotals.revenue30d, storeCurrency),
    },
    {
      id: "purchases",
      label: t("overview.nav.purchases"),
      count: suppliers?.unpaidCount ?? 0,
      metric: snapshot
        ? formatCurrency(snapshot.costs, purchaseCurrency)
        : suppliers
          ? formatCurrency(suppliers.unpaidSum, purchaseCurrency)
          : undefined,
    },
  ];

  const kpiCards: Array<{
    id: OverviewSectionId | "revenue";
    section: OverviewSectionId;
    label: string;
    value: string;
    sub: string;
    icon: typeof Package;
  }> = [
    {
      id: "revenue",
      section: "sales",
      label: t("overview.kpi.revenue"),
      value: formatCurrency(stats?.revenue30d ?? 0, storeCurrency),
      sub: t("overview.kpi.revenueSub", { count: stats?.ordersWindow ?? 0 }),
      icon: BadgeDollarSign,
    },
    {
      id: "sales",
      section: "sales",
      label: t("overview.kpi.sales"),
      value: formatNumber(stats?.ordersWindow ?? orderTotals.count),
      sub: t("overview.kpi.salesSub", {
        aov: formatCurrency(stats?.avgOrderValue ?? 0, storeCurrency),
      }),
      icon: ShoppingBag,
    },
    {
      id: "customers",
      section: "customers",
      label: t("overview.kpi.customers"),
      value: formatNumber(stats?.customersCount ?? 0),
      sub: t("overview.kpi.customersSub", { count: stats?.newCustomers30d ?? 0 }),
      icon: Users,
    },
    {
      id: "products",
      section: "products",
      label: t("overview.kpi.products"),
      value: formatNumber(Math.max(stats?.productsCount ?? 0, products.length)),
      sub:
        (stats?.lowStockCount ?? 0) > 0
          ? t("overview.kpi.productsLowStock", { count: stats?.lowStockCount ?? 0 })
          : t("overview.kpi.productsOk"),
      icon: Package,
    },
    {
      id: "ads",
      section: "ads",
      label: t("overview.kpi.adSpend"),
      value:
        adTotals.spend != null
          ? formatCurrency(adTotals.spend, performance?.adSpendCurrency || storeCurrency)
          : "—",
      sub:
        adTotals.roas != null
          ? t("overview.kpi.roas", { value: adTotals.roas.toFixed(2) })
          : t("overview.kpi.adsConnect"),
      icon: Megaphone,
    },
    {
      id: "purchases",
      section: "purchases",
      label: t("overview.kpi.purchases"),
      value: snapshot
        ? formatCurrency(snapshot.costs, purchaseCurrency)
        : suppliers
          ? formatCurrency(suppliers.unpaidSum, purchaseCurrency)
          : "—",
      sub: snapshot
        ? t("overview.kpi.purchasesSnapshot")
        : suppliers
          ? t("overview.kpi.purchasesUnpaid", { count: suppliers.unpaidCount })
          : t("overview.kpi.purchasesConnect"),
      icon: Truck,
    },
  ];

  function openSection(id: OverviewSectionId) {
    setDetailSection(id);
  }

  function handleSignal(signal: OverviewSignal) {
    switch (signal.action) {
      case "filter-stale":
        onFilterStaleUnfulfilled?.();
        break;
      case "filter-pending":
        onFilterPendingPayments?.();
        break;
      case "open-marketing":
        openSection("ads");
        break;
      case "open-economy":
        openSection("purchases");
        break;
      case "open-products":
        openSection("products");
        break;
      case "open-orders":
        onOpenTab("orders");
        break;
      default:
        openSection(signal.section);
    }
  }

  const quickActions = [
    {
      id: "orders",
      label: t("overview.quick.orders"),
      onClick: () => onOpenTab("orders"),
      show: Boolean(shopifyData),
    },
    {
      id: "export",
      label: t("overview.quick.exportOrders"),
      onClick: () => onExportOrders?.(),
      show: Boolean(onExportOrders && orderRows.length > 0),
    },
    {
      id: "products",
      label: t("overview.quick.products"),
      onClick: () => onOpenTab("products"),
      show: true,
    },
    {
      id: "ads",
      label: t("overview.quick.ads"),
      onClick: () => openSection("ads"),
      show: adsConnected.meta_business || adsConnected.google_ads,
    },
    {
      id: "recover",
      label: t("overview.quick.recover"),
      onClick: () => onOpenTab("orders"),
      show: (stats?.abandonedCheckouts30d ?? 0) > 0,
    },
    {
      id: "economy",
      label: t("overview.quick.economy"),
      href: "/company?tab=economy",
      show: Boolean(snapshot || suppliers),
    },
  ].filter((a) => a.show);

  const platformLabel = (platform: "meta_business" | "google_ads") =>
    platform === "meta_business" ? t("overview.ads.meta") : t("overview.ads.google");

  return (
    <div className="space-y-8">
      <m.div {...fadeUp} transition={{ duration: 0.35 }} className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("overview.title")}</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">{t("overview.description")}</p>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("overview.searchPlaceholder")}
            aria-label={t("overview.searchAria")}
            className="sm:max-w-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => openSection(section.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              {section.label}
              <span className="tabular-nums text-foreground/80">{formatNumber(section.count)}</span>
              {section.metric ? (
                <span className="tabular-nums text-foreground/60">{section.metric}</span>
              ) : null}
              <ChevronRight className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      </m.div>

      {signals.length > 0 ? (
        <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.04 }} className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            {t("overview.signals.heading")}
          </div>
          <div className="flex flex-wrap gap-2">
            {signals.map((signal) => (
              <button
                key={signal.id}
                type="button"
                onClick={() => handleSignal(signal)}
                className={cn(
                  "inline-flex max-w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-opacity hover:opacity-90",
                  severityClass[signal.severity]
                )}
              >
                <span className="text-xs font-medium text-foreground">
                  {t(`overview.signals.${signal.titleKey}`)}
                </span>
                <span className="text-[11px] text-muted-foreground line-clamp-2">
                  {t(`overview.signals.${signal.detailKey}`, signal.detailParams)}
                </span>
              </button>
            ))}
          </div>
        </m.div>
      ) : null}

      {quickActions.length > 0 ? (
        <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.06 }} className="flex flex-wrap gap-2">
          {quickActions.map((action) =>
            "href" in action && action.href ? (
              <Button key={action.id} size="sm" variant="outline" asChild>
                <Link to={action.href}>{action.label}</Link>
              </Button>
            ) : (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )
          )}
        </m.div>
      ) : null}

      {(stats?.abandonedCheckouts30d ?? 0) > 0 ? (
        <AutomationEnableHint
          compact
          tab="reports"
          focus="cart-recovery"
          title={t("orders.automationHint.title")}
          description={t("orders.automationHint.description")}
          ctaLabel={t("orders.automationHint.cta")}
        />
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
        {kpiCards.map((card, i) => (
          <m.div key={card.id} {...fadeUp} transition={{ duration: 0.35, delay: i * 0.04 }}>
            <button
              type="button"
              onClick={() => openSection(card.section)}
              className="w-full text-left h-full group"
            >
              <Card className="bg-card border-border h-full transition-colors group-hover:border-foreground/25 group-hover:bg-muted/10">
                <CardContent className="p-4 min-h-[112px] flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <card.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">
                      {t("overview.openDetails")}
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                  <p className="text-xl font-semibold tabular-nums tracking-tight">{card.value}</p>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-auto pt-2">{card.sub}</p>
                </CardContent>
              </Card>
            </button>
          </m.div>
        ))}
      </div>

      {pulseStats.length > 0 ? (
        <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.08 }} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("overview.pulse.heading")}</p>
            <p className="text-[11px] text-muted-foreground/70">{t("overview.pulse.subheading")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {pulseStats.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => openSection(tile.section)}
                className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/20"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                <p className="text-base font-semibold tabular-nums tracking-tight">{tile.value}</p>
                {tile.hint ? (
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1">{tile.hint}</p>
                ) : null}
              </button>
            ))}
          </div>
        </m.div>
      ) : null}

      {shopifyData ? (
        <RevenueTrendCard
          revenueTrend={shopifyData.revenueTrend}
          revenue30d={shopifyData.stats.revenue30d}
          currency={storeCurrency}
        />
      ) : null}

      {ordersForMix > 0 || adsConnected.meta_business || adsConnected.google_ads || snapshot ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {ordersForMix > 0 ? (
            <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.1 }}>
              <Card className="bg-card border-border h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("overview.mix.title")}</CardTitle>
                  <CardDescription>
                    {t("overview.mix.description", { count: ordersForMix })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("overview.detail.byFulfillment")}
                    </p>
                    <OverviewBreakdownBars data={fulfillmentMix} total={ordersForMix} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("overview.detail.byPayment")}
                    </p>
                    <OverviewBreakdownBars data={paymentMix} total={ordersForMix} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openSection("sales")}>
                      {t("overview.openDetails")}
                      <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          ) : null}

          {adsConnected.meta_business || adsConnected.google_ads || snapshot ? (
            <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.12 }}>
              <Card className="bg-card border-border h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("overview.performance.title")}</CardTitle>
                  <CardDescription>{t("overview.performance.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {adsConnected.meta_business || adsConnected.google_ads ? (
                      <>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("overview.kpi.adSpend")}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {adTotals.spend != null
                              ? formatCurrency(
                                  adTotals.spend,
                                  performance?.adSpendCurrency || storeCurrency
                                )
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("overview.performance.roas")}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {adTotals.roas != null ? `${adTotals.roas.toFixed(2)}×` : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("overview.pulse.adConversions")}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {formatNumber(adTotals.conversions)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("overview.performance.campaigns")}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {formatNumber(adTotals.count)}
                          </p>
                        </div>
                      </>
                    ) : null}
                    {snapshot ? (
                      <>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("overview.purchases.costs")}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {formatCurrency(snapshot.costs, purchaseCurrency)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("overview.detail.margin")}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {marginPct != null ? `${marginPct}%` : "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                            {formatCurrency(snapshot.resultEstimate, purchaseCurrency)}
                          </p>
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {adsConnected.meta_business || adsConnected.google_ads ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => openSection("ads")}>
                        {t("overview.nav.ads")}
                        <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    ) : null}
                    {snapshot ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openSection("purchases")}
                      >
                        {t("overview.nav.purchases")}
                        <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </m.div>
          ) : null}
        </div>
      ) : null}

      {/* Compact section previews — click through for deep stats */}
      <SectionPreview
        id="products"
        icon={<Box className="h-4 w-4" />}
        title={t("overview.products.title")}
        summary={t("overview.products.summary", {
          count: productTotals.count,
          sold: formatNumber(productTotals.sold),
          revenue: formatCurrency(productTotals.revenue, storeCurrency),
        })}
        onOpen={() => openSection("products")}
        empty={productRows.length === 0}
        emptyText={t("overview.products.empty")}
        emptyAction={
          <Button size="sm" onClick={() => onOpenTab("products")}>
            {t("overview.openProducts")}
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.products.colName")}</TableHead>
              <TableHead className="text-right">{t("overview.products.colSold")}</TableHead>
              <TableHead className="text-right">{t("overview.products.colRevenue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productRows.slice(0, 8).map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => openSection("products")}
              >
                <TableCell className="font-medium max-w-[220px] truncate">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.sold)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(row.revenue, storeCurrency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionPreview>

      <SectionPreview
        id="customers"
        icon={<Users className="h-4 w-4" />}
        title={t("overview.customers.title")}
        summary={t("overview.customers.summary", {
          count: customerTotals.totalCustomers,
          listed: customerTotals.listed,
          orders: formatNumber(customerTotals.orders),
          spent: formatCurrency(customerTotals.spent, storeCurrency),
        })}
        onOpen={() => openSection("customers")}
        empty={customerRows.length === 0}
        emptyText={t("overview.customers.empty")}
        emptyAction={
          shopifyData ? (
            <Button size="sm" onClick={() => onOpenTab("insights")}>
              {t("overview.detail.openInsights")}
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to="/connections?session=shopify">{t("overview.customers.connect")}</Link>
            </Button>
          )
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.customers.colName")}</TableHead>
              <TableHead className="text-right">{t("overview.customers.colOrders")}</TableHead>
              <TableHead className="text-right">{t("overview.customers.colSpent")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customerRows.slice(0, 8).map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => openSection("customers")}>
                <TableCell className="font-medium max-w-[180px] truncate">{c.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(c.ordersCount)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(c.totalSpent, c.currency || storeCurrency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionPreview>

      <SectionPreview
        id="ads"
        icon={<Megaphone className="h-4 w-4" />}
        title={t("overview.ads.title")}
        summary={t("overview.ads.summary", {
          count: adTotals.count,
          spend: formatCurrency(adTotals.spend ?? 0, performance?.adSpendCurrency || storeCurrency),
          conversions: formatNumber(adTotals.conversions),
          roas: adTotals.roas != null ? adTotals.roas.toFixed(2) : "—",
        })}
        onOpen={() => openSection("ads")}
        empty={!adsConnected.meta_business && !adsConnected.google_ads}
        emptyText={t("overview.ads.empty")}
        emptyAction={
          <Button size="sm" asChild>
            <Link to="/connections?wizard=1">{t("overview.ads.connect")}</Link>
          </Button>
        }
        loading={adsLoading}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.ads.colName")}</TableHead>
              <TableHead>{t("overview.ads.colPlatform")}</TableHead>
              <TableHead className="text-right">{t("overview.ads.colSpend")}</TableHead>
              <TableHead className="text-right">{t("overview.ads.colRoas")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.slice(0, 8).map((c) => (
              <TableRow
                key={`${c.platform}-${c.id}`}
                className="cursor-pointer"
                onClick={() => openSection("ads")}
              >
                <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal">
                    {platformLabel(c.platform)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(c.spend, c.accountCurrency || performance?.adSpendCurrency || storeCurrency)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {c.roas != null ? c.roas.toFixed(2) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionPreview>

      <SectionPreview
        id="sales"
        icon={<ShoppingBag className="h-4 w-4" />}
        title={t("overview.sales.title")}
        summary={t("overview.sales.summary", {
          count: orderTotals.count,
          sum: formatCurrency(orderTotals.sum, storeCurrency),
          items: formatNumber(orderTotals.items),
          revenue30d: formatCurrency(orderTotals.revenue30d, storeCurrency),
        })}
        onOpen={() => openSection("sales")}
        empty={orderRows.length === 0}
        emptyText={t("overview.sales.empty")}
        emptyAction={
          shopifyData ? (
            <Button size="sm" onClick={() => onOpenTab("orders")}>
              {t("overview.openOrders")}
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to="/connections?session=shopify">{t("overview.sales.connect")}</Link>
            </Button>
          )
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.sales.colOrder")}</TableHead>
              <TableHead>{t("overview.sales.colCustomer")}</TableHead>
              <TableHead className="text-right">{t("overview.sales.colTotal")}</TableHead>
              <TableHead className="text-right">{t("overview.sales.colDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderRows.slice(0, 8).map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => openSection("sales")}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground">
                  {o.customer || o.email || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(o.total, o.currency || storeCurrency)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                  {formatDate(o.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionPreview>

      <SectionPreview
        id="purchases"
        icon={<Truck className="h-4 w-4" />}
        title={t("overview.purchases.title")}
        summary={
          snapshot
            ? t("overview.purchases.summarySnapshot", {
                costs: formatCurrency(snapshot.costs, purchaseCurrency),
                revenue: formatCurrency(snapshot.revenue, purchaseCurrency),
                result: formatCurrency(snapshot.resultEstimate, purchaseCurrency),
              })
            : suppliers
              ? t("overview.purchases.summarySuppliers", {
                  count: suppliers.unpaidCount,
                  sum: formatCurrency(suppliers.unpaidSum, purchaseCurrency),
                  overdue: suppliers.overdueCount,
                })
              : t("overview.purchases.description")
        }
        onOpen={() => openSection("purchases")}
        empty={!snapshot && !suppliers}
        emptyText={t("overview.purchases.empty")}
        emptyAction={
          <Button size="sm" asChild>
            <Link to="/connections?session=fortnox">{t("overview.purchases.connect")}</Link>
          </Button>
        }
        loading={snapshotQuery.isLoading || supplierQuery.isLoading}
      >
        {supplierRows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.purchases.colSupplier")}</TableHead>
                <TableHead className="text-right">{t("overview.purchases.colBalance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierRows.slice(0, 8).map((inv) => (
                <TableRow
                  key={inv.givenNumber || inv.invoiceNumber}
                  className="cursor-pointer"
                  onClick={() => openSection("purchases")}
                >
                  <TableCell className="font-medium max-w-[200px] truncate">{inv.supplierName}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(inv.balance, inv.currency || purchaseCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : snapshot ? (
          <p className="text-sm text-muted-foreground px-1 py-2">{t("overview.purchases.noSupplierRows")}</p>
        ) : null}
      </SectionPreview>

      <OverviewSectionSheet
        open={detailSection != null}
        section={detailSection}
        onOpenChange={(open) => {
          if (!open) setDetailSection(null);
        }}
        shopifyData={shopifyData}
        storeCurrency={storeCurrency}
        businessProfileId={businessProfileId}
        productRows={productRows}
        customerRows={customerRows}
        campaigns={campaigns}
        performance={performance}
        analytics={analytics}
        snapshot={snapshot}
        suppliers={suppliers}
        purchaseCurrency={purchaseCurrency}
        onOpenTab={onOpenTab}
        onCreateLead={onCreateLead}
        onFilterStaleUnfulfilled={onFilterStaleUnfulfilled}
        onFilterPendingPayments={onFilterPendingPayments}
        onExportOrders={onExportOrders}
      />
    </div>
  );
}

function OverviewBreakdownBars({
  data,
  total,
}: {
  data: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>;
  }
  return (
    <div className="space-y-2">
      {entries.map(([key, count]) => {
        const pct = shareOfTotal(count, total);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize text-muted-foreground">{key.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-foreground">
                {count} · {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionPreview({
  id,
  icon,
  title,
  summary,
  onOpen,
  empty,
  emptyText,
  emptyAction,
  loading,
  children,
}: {
  id: OverviewSectionId;
  icon: ReactNode;
  title: string;
  summary: string;
  onOpen: () => void;
  empty?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation("ecommerce");
  return (
    <section id={`overview-${id}`} className="scroll-mt-20">
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {icon}
                {title}
              </CardTitle>
              <CardDescription>{summary}</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onOpen}>
              {t("overview.openDetails")}
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("overview.loading")}</p>
          ) : empty ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">{emptyText}</p>
              {emptyAction}
            </div>
          ) : (
            <div className="overflow-x-auto">{children}</div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
