import type { ShopifyData, ShopifyOrder, TopCustomer } from "@/features/ecommerce/ecommerceOrg";
import type { AdCampaign } from "@/features/marketing/useMarketingCampaigns";
import type { FortnoxFinancialSnapshot, FortnoxSupplierInvoiceSummary } from "@/features/economy/economyClient";
import type { Product } from "@/types/ecommerce";

export type OverviewSectionId = "products" | "customers" | "ads" | "sales" | "purchases";

export type OverviewSignalSeverity = "critical" | "warning" | "opportunity" | "info";

export type OverviewSignal = {
  id: string;
  severity: OverviewSignalSeverity;
  section: OverviewSectionId;
  /** i18n key under overview.signals.* */
  titleKey: string;
  detailKey: string;
  detailParams?: Record<string, string | number>;
  action?: "open-section" | "filter-stale" | "filter-pending" | "open-marketing" | "open-economy" | "open-products" | "open-orders";
};

export type ProductOverviewRow = {
  id: string;
  name: string;
  vendor: string;
  status: string;
  price: number | null;
  currency: string;
  sold: number;
  revenue: number;
  source: "catalog" | "shopify";
  adminUrl?: string | null;
  tags?: string[];
};

export function campaignSpend(c: AdCampaign): number {
  return c.metrics?.spend ?? c.spend7d ?? 0;
}

export function campaignRoas(c: AdCampaign): number | null {
  return c.metrics?.roas ?? c.roas7d ?? null;
}

export function campaignConversions(c: AdCampaign): number {
  return c.metrics?.conversions ?? c.conversions7d ?? 0;
}

export function campaignValue(c: AdCampaign): number {
  return c.metrics?.conversionValue ?? c.conversionValue7d ?? 0;
}

export function campaignClicks(c: AdCampaign): number {
  return c.metrics?.clicks ?? c.clicks7d ?? 0;
}

export function campaignImpressions(c: AdCampaign): number {
  return c.metrics?.impressions ?? c.impressions7d ?? 0;
}

export function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query);
}

export function buildProductRows(
  products: Product[],
  shopifyData: ShopifyData | null,
  storeCurrency: string,
  query: string
): ProductOverviewRow[] {
  const salesByProduct = new Map<string, { quantity: number; revenue: number }>();
  for (const p of shopifyData?.topProducts ?? []) {
    const key = p.title.trim().toLowerCase();
    if (!key) continue;
    const prev = salesByProduct.get(key) || { quantity: 0, revenue: 0 };
    salesByProduct.set(key, {
      quantity: prev.quantity + p.quantity,
      revenue: prev.revenue + p.revenue,
    });
  }

  const catalog = products.map((product) => {
    const sales = salesByProduct.get(product.name.trim().toLowerCase());
    const priceNum = product.price != null && product.price !== "" ? Number(product.price) : null;
    return {
      id: product.id,
      name: product.name,
      vendor: product.vendor || "—",
      status: product.status || "—",
      price: Number.isFinite(priceNum) ? (priceNum as number) : null,
      currency: product.currency || storeCurrency,
      sold: sales?.quantity ?? 0,
      revenue: sales?.revenue ?? 0,
      source: "catalog" as const,
      adminUrl: product.adminUrl,
      tags: product.tags,
    };
  });

  const catalogNames = new Set(catalog.map((r) => r.name.trim().toLowerCase()));
  const extras = (shopifyData?.topProducts ?? [])
    .filter((p) => !catalogNames.has(p.title.trim().toLowerCase()))
    .map((p, i) => ({
      id: `shopify-${p.productId ?? i}`,
      name: p.title,
      vendor: "—",
      status: "active",
      price: null as number | null,
      currency: storeCurrency,
      sold: p.quantity,
      revenue: p.revenue,
      source: "shopify" as const,
      adminUrl: null as string | null,
      tags: [] as string[],
    }));

  return [...catalog, ...extras].filter((row) =>
    matchesQuery(`${row.name} ${row.vendor} ${row.status} ${(row.tags || []).join(" ")}`, query)
  );
}

export function fulfillmentBreakdown(orders: ShopifyOrder[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) {
    const key = o.fulfillment || "unfulfilled";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

export function paymentBreakdown(orders: ShopifyOrder[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) {
    const key = o.status || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

export function shareOfTotal(part: number, total: number): number {
  if (!total || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function buildOverviewSignals(args: {
  shopifyData: ShopifyData | null;
  campaigns: Array<AdCampaign & { name: string }>;
  portfolioRoas: number | null;
  suppliers?: FortnoxSupplierInvoiceSummary;
  snapshot?: FortnoxFinancialSnapshot;
  actionNeeded: { staleUnfulfilled: number; pendingPayments: number; lowStock: number } | null;
}): OverviewSignal[] {
  const signals: OverviewSignal[] = [];
  const { shopifyData, campaigns, portfolioRoas, suppliers, snapshot, actionNeeded } = args;
  const stats = shopifyData?.stats;

  if (actionNeeded && actionNeeded.staleUnfulfilled > 0) {
    signals.push({
      id: "stale-unfulfilled",
      severity: "critical",
      section: "sales",
      titleKey: "staleUnfulfilledTitle",
      detailKey: "staleUnfulfilledDetail",
      detailParams: { count: actionNeeded.staleUnfulfilled },
      action: "filter-stale",
    });
  }

  if (actionNeeded && actionNeeded.pendingPayments > 0) {
    signals.push({
      id: "pending-payments",
      severity: "warning",
      section: "sales",
      titleKey: "pendingPaymentsTitle",
      detailKey: "pendingPaymentsDetail",
      detailParams: { count: actionNeeded.pendingPayments },
      action: "filter-pending",
    });
  }

  if ((stats?.lowStockCount ?? 0) > 0) {
    signals.push({
      id: "low-stock",
      severity: "warning",
      section: "products",
      titleKey: "lowStockTitle",
      detailKey: "lowStockDetail",
      detailParams: { count: stats!.lowStockCount },
      action: "open-products",
    });
  }

  const abandonedValue = stats?.abandonedValue30d ?? 0;
  const abandonedCount = stats?.abandonedCheckouts30d ?? 0;
  if (abandonedCount > 0 && abandonedValue > 0) {
    signals.push({
      id: "abandoned",
      severity: "opportunity",
      section: "sales",
      titleKey: "abandonedTitle",
      detailKey: "abandonedDetail",
      detailParams: { count: abandonedCount, value: Math.round(abandonedValue) },
      action: "open-orders",
    });
  }

  if (portfolioRoas != null && portfolioRoas > 0 && portfolioRoas < 1) {
    signals.push({
      id: "low-roas",
      severity: "critical",
      section: "ads",
      titleKey: "lowRoasTitle",
      detailKey: "lowRoasDetail",
      detailParams: { roas: Number(portfolioRoas.toFixed(2)) },
      action: "open-marketing",
    });
  }

  const wasteful = campaigns.filter((c) => campaignSpend(c) >= 20 && campaignConversions(c) === 0);
  if (wasteful.length > 0) {
    signals.push({
      id: "ads-no-conv",
      severity: "warning",
      section: "ads",
      titleKey: "adsNoConvTitle",
      detailKey: "adsNoConvDetail",
      detailParams: { count: wasteful.length },
      action: "open-section",
    });
  }

  if (suppliers && suppliers.overdueCount > 0) {
    signals.push({
      id: "supplier-overdue",
      severity: "critical",
      section: "purchases",
      titleKey: "supplierOverdueTitle",
      detailKey: "supplierOverdueDetail",
      detailParams: { count: suppliers.overdueCount },
      action: "open-economy",
    });
  }

  if (snapshot && snapshot.revenue > 0) {
    const margin = ((snapshot.revenue - snapshot.costs) / snapshot.revenue) * 100;
    if (margin < 10) {
      signals.push({
        id: "thin-margin",
        severity: "warning",
        section: "purchases",
        titleKey: "thinMarginTitle",
        detailKey: "thinMarginDetail",
        detailParams: { margin: Math.round(margin) },
        action: "open-section",
      });
    }
  }

  if ((stats?.newCustomers30d ?? 0) >= 5) {
    signals.push({
      id: "new-customers",
      severity: "info",
      section: "customers",
      titleKey: "newCustomersTitle",
      detailKey: "newCustomersDetail",
      detailParams: { count: stats!.newCustomers30d },
      action: "open-section",
    });
  }

  const top = shopifyData?.topProducts?.[0];
  const revenue30d = stats?.revenue30d ?? 0;
  if (top && revenue30d > 0) {
    const share = shareOfTotal(top.revenue, revenue30d);
    if (share >= 40) {
      signals.push({
        id: "concentration",
        severity: "opportunity",
        section: "products",
        titleKey: "concentrationTitle",
        detailKey: "concentrationDetail",
        detailParams: { name: top.title.slice(0, 40), share },
        action: "open-section",
      });
    }
  }

  const severityRank: Record<OverviewSignalSeverity, number> = {
    critical: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  };
  return signals.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, 6);
}

export function topCustomerRepeatHint(customers: TopCustomer[]): {
  repeatCount: number;
  oneTimeCount: number;
  avgOrders: number;
} {
  let repeat = 0;
  let oneTime = 0;
  let orders = 0;
  for (const c of customers) {
    orders += c.ordersCount;
    if (c.ordersCount >= 2) repeat += 1;
    else oneTime += 1;
  }
  return {
    repeatCount: repeat,
    oneTimeCount: oneTime,
    avgOrders: customers.length ? orders / customers.length : 0,
  };
}
