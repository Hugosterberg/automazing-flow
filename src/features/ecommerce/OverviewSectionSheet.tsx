import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  Copy,
  Download,
  ExternalLink,
  Megaphone,
  Package,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AbandonedCheckoutRecoveryButton } from "@/features/ecommerce/AbandonedCheckoutRecoveryButton";
import {
  formatDate,
  type LowStockItem,
  type ShopifyData,
  type TopCustomer,
} from "@/features/ecommerce/ecommerceOrg";
import type { FortnoxFinancialSnapshot, FortnoxSupplierInvoiceSummary } from "@/features/economy/economyClient";
import type { MarketingAnalytics, MarketingPerformance } from "@/features/marketing/useMarketingCampaigns";
import type { LeadInput } from "@/features/leads";
import { formatCurrency, formatNumber } from "@/lib/format";
import { downloadCsv, toCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import {
  campaignConversions,
  campaignClicks,
  campaignImpressions,
  campaignRoas,
  campaignSpend,
  campaignValue,
  fulfillmentBreakdown,
  matchesQuery,
  paymentBreakdown,
  shareOfTotal,
  topCustomerRepeatHint,
  type OverviewSectionId,
  type ProductOverviewRow,
} from "./overviewInsights";

export type FlatCampaignRow = {
  id: string;
  name: string;
  status: string;
  platform: "meta_business" | "google_ads";
  accountName: string;
  accountCurrency?: string;
  spend: number;
  conversions: number;
  value: number;
  roas: number | null;
  clicks: number;
  impressions: number;
};

type Props = {
  open: boolean;
  section: OverviewSectionId | null;
  onOpenChange: (open: boolean) => void;
  shopifyData: ShopifyData | null;
  storeCurrency: string;
  businessProfileId: string | null;
  productRows: ProductOverviewRow[];
  customerRows: TopCustomer[];
  campaigns: FlatCampaignRow[];
  performance?: MarketingPerformance;
  analytics?: MarketingAnalytics | null;
  snapshot?: FortnoxFinancialSnapshot;
  suppliers?: FortnoxSupplierInvoiceSummary;
  purchaseCurrency: string;
  onOpenTab: (tab: "products" | "orders" | "insights") => void;
  onCreateLead?: (input: LeadInput) => Promise<unknown>;
  onFilterStaleUnfulfilled?: () => void;
  onFilterPendingPayments?: () => void;
  onExportOrders?: () => void;
};

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground/80 mt-0.5">{hint}</p> : null}
    </div>
  );
}

function BreakdownBars({
  data,
  total,
}: {
  data: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
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

export function OverviewSectionSheet(props: Props) {
  const { t } = useTranslation("ecommerce");
  const [localQuery, setLocalQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const q = localQuery.trim().toLowerCase();

  const section = props.section;
  const open = props.open && section != null;

  const title =
    section === "products"
      ? t("overview.products.title")
      : section === "customers"
        ? t("overview.customers.title")
        : section === "ads"
          ? t("overview.ads.title")
          : section === "sales"
            ? t("overview.sales.title")
            : t("overview.purchases.title");

  const description =
    section === "products"
      ? t("overview.detail.productsDesc")
      : section === "customers"
        ? t("overview.detail.customersDesc")
        : section === "ads"
          ? t("overview.detail.adsDesc")
          : section === "sales"
            ? t("overview.detail.salesDesc")
            : t("overview.detail.purchasesDesc");

  const icon =
    section === "products" ? (
      <Package className="h-4 w-4" />
    ) : section === "customers" ? (
      <Users className="h-4 w-4" />
    ) : section === "ads" ? (
      <Megaphone className="h-4 w-4" />
    ) : section === "sales" ? (
      <ShoppingBag className="h-4 w-4" />
    ) : (
      <Truck className="h-4 w-4" />
    );

  function handleOpenChange(next: boolean) {
    if (!next) {
      setLocalQuery("");
      setSelectedProductId(null);
    }
    props.onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,42rem)] sm:max-w-xl overflow-y-auto"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="flex items-center gap-2">
            {icon}
            {title}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <Input
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={t("overview.detail.filterPlaceholder")}
            aria-label={t("overview.detail.filterAria")}
          />

          {section === "products" ? (
            <ProductsDetail
              {...props}
              query={q}
              selectedProductId={selectedProductId}
              onSelectProduct={setSelectedProductId}
            />
          ) : null}
          {section === "customers" ? <CustomersDetail {...props} query={q} /> : null}
          {section === "ads" ? <AdsDetail {...props} query={q} /> : null}
          {section === "sales" ? <SalesDetail {...props} query={q} /> : null}
          {section === "purchases" ? <PurchasesDetail {...props} query={q} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProductsDetail({
  shopifyData,
  storeCurrency,
  productRows,
  query,
  selectedProductId,
  onSelectProduct,
  onOpenTab,
}: Props & {
  query: string;
  selectedProductId: string | null;
  onSelectProduct: (id: string | null) => void;
}) {
  const { t } = useTranslation("ecommerce");
  const rows = useMemo(
    () =>
      productRows
        .filter((r) => matchesQuery(`${r.name} ${r.vendor}`, query))
        .sort((a, b) => b.revenue - a.revenue || b.sold - a.sold),
    [productRows, query]
  );
  const selected = rows.find((r) => r.id === selectedProductId) || null;
  const lowStock: LowStockItem[] = shopifyData?.lowStock ?? [];
  const withSales = rows.filter((r) => r.sold > 0).length;
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalSold = rows.reduce((s, r) => s + r.sold, 0);
  const priced = rows.filter((r) => r.price != null);
  const avgPrice =
    priced.length > 0 ? priced.reduce((s, r) => s + (r.price || 0), 0) / priced.length : null;

  function exportProducts() {
    downloadCsv(
      toCsv(
        rows.map((r) => ({
          name: r.name,
          vendor: r.vendor,
          status: r.status,
          price: r.price,
          currency: r.currency,
          sold: r.sold,
          revenue: r.revenue,
        }))
      ),
      `products-overview-${new Date().toISOString().slice(0, 10)}.csv`
    );
    toast.success(t("overview.detail.exported"));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label={t("overview.detail.productCount")} value={formatNumber(rows.length)} />
        <StatTile
          label={t("overview.detail.withSales")}
          value={formatNumber(withSales)}
          hint={t("overview.detail.shareHint", { pct: shareOfTotal(withSales, rows.length) })}
        />
        <StatTile label={t("overview.detail.unitsSold")} value={formatNumber(totalSold)} />
        <StatTile
          label={t("overview.detail.matchedRevenue")}
          value={formatCurrency(totalRevenue, storeCurrency)}
          hint={
            avgPrice != null
              ? t("overview.detail.avgPrice", { value: formatCurrency(avgPrice, storeCurrency) })
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onOpenTab("products")}>
          {t("overview.openProducts")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportProducts}>
          <Download className="h-3.5 w-3.5 mr-1" />
          {t("overview.detail.exportCsv")}
        </Button>
        {shopifyData?.adminLinks.products ? (
          <Button size="sm" variant="outline" asChild>
            <a href={shopifyData.adminLinks.products} target="_blank" rel="noreferrer">
              {t("overview.openShopify")}
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </a>
          </Button>
        ) : null}
      </div>

      {lowStock.length > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
          <p className="text-xs font-medium">{t("overview.detail.lowStockList")}</p>
          {lowStock.slice(0, 8).map((item) => (
            <div key={`${item.productId}-${item.sku || item.variantTitle}`} className="flex justify-between gap-2 text-xs">
              <span className="truncate">
                {item.productTitle}
                {item.variantTitle ? ` · ${item.variantTitle}` : ""}
              </span>
              <span className="tabular-nums text-warning shrink-0">{item.quantity}</span>
            </div>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {selected.vendor} · {selected.status}
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => onSelectProduct(null)}>
              {t("overview.detail.back")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label={t("overview.products.colSold")}
              value={formatNumber(selected.sold)}
            />
            <StatTile
              label={t("overview.products.colRevenue")}
              value={formatCurrency(selected.revenue, storeCurrency)}
            />
          </div>
          {selected.tags && selected.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.tags.slice(0, 12).map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenTab("products")}>
              {t("overview.detail.editInCatalog")}
            </Button>
            {selected.adminUrl ? (
              <Button size="sm" variant="outline" asChild>
                <a href={selected.adminUrl} target="_blank" rel="noreferrer">
                  {t("overview.openShopify")}
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.products.colName")}</TableHead>
                <TableHead className="text-right">{t("overview.products.colSold")}</TableHead>
                <TableHead className="text-right">{t("overview.products.colRevenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => onSelectProduct(row.id)}
                >
                  <TableCell className="font-medium max-w-[200px] truncate">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(row.sold)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.revenue, storeCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CustomersDetail({
  shopifyData,
  storeCurrency,
  customerRows,
  query,
  onCreateLead,
  onOpenTab,
}: Props & { query: string }) {
  const { t } = useTranslation("ecommerce");
  const rows = useMemo(
    () =>
      customerRows
        .filter((c) => matchesQuery(`${c.name} ${c.email}`, query))
        .sort((a, b) => b.totalSpent - a.totalSpent),
    [customerRows, query]
  );
  const hint = topCustomerRepeatHint(rows);
  const totalSpent = rows.reduce((s, c) => s + c.totalSpent, 0);
  const avgSpent = rows.length ? totalSpent / rows.length : 0;

  function addLead(customer: TopCustomer) {
    if (!onCreateLead) return;
    void onCreateLead({
      company: customer.name,
      contactName: customer.name,
      email: customer.email,
      source: "shopify-customer",
      status: "qualified",
      notes: t("insights.leadNotes", {
        amount: formatCurrency(customer.totalSpent, customer.currency || storeCurrency),
        count: customer.ordersCount,
      }),
    }).then(() => toast.success(t("toasts.addedToLeads")));
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast.success(t("toasts.copied"));
    } catch {
      toast.error(t("toasts.copyFailed"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label={t("overview.detail.customersListed")}
          value={formatNumber(rows.length)}
          hint={t("overview.detail.storeTotal", {
            count: shopifyData?.stats.customersCount ?? rows.length,
          })}
        />
        <StatTile
          label={t("overview.detail.avgSpent")}
          value={formatCurrency(avgSpent, storeCurrency)}
        />
        <StatTile
          label={t("overview.detail.repeatBuyers")}
          value={formatNumber(hint.repeatCount)}
          hint={t("overview.detail.avgOrders", { value: hint.avgOrders.toFixed(1) })}
        />
        <StatTile
          label={t("overview.detail.oneTime")}
          value={formatNumber(hint.oneTimeCount)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" asChild>
          <Link to="/customers">
            {t("overview.detail.openCustomers")}
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenTab("insights")}>
          {t("overview.detail.openInsights")}
        </Button>
        {shopifyData?.adminLinks.customers ? (
          <Button size="sm" variant="outline" asChild>
            <a href={shopifyData.adminLinks.customers} target="_blank" rel="noreferrer">
              {t("overview.openShopify")}
            </a>
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        {rows.slice(0, 40).map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-border/50 px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {c.email || t("insights.topCustomers.ordersCount", { count: c.ordersCount })}
              </p>
              <p className="text-xs tabular-nums mt-0.5">
                {formatCurrency(c.totalSpent, c.currency || storeCurrency)} ·{" "}
                {t("insights.topCustomers.ordersCount", { count: c.ordersCount })}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {c.email ? (
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => void copyEmail(c.email)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {onCreateLead ? (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => addLead(c)}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {t("insights.topCustomers.addLead")}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t("overview.customers.empty")}</p>
        ) : null}
      </div>
    </div>
  );
}

function AdsDetail({
  campaigns,
  performance,
  analytics,
  storeCurrency,
  query,
}: Props & { query: string }) {
  const { t } = useTranslation("ecommerce");
  const rows = useMemo(
    () =>
      campaigns
        .filter((c) => matchesQuery(`${c.name} ${c.status} ${c.platform}`, query))
        .sort((a, b) => b.spend - a.spend),
    [campaigns, query]
  );
  const spend = performance?.adSpend ?? rows.reduce((s, c) => s + c.spend, 0);
  const currency = performance?.adSpendCurrency || storeCurrency;
  const poor = rows.filter((c) => (c.roas != null && c.roas < 1 && c.spend > 0) || (c.spend >= 20 && c.conversions === 0));
  const byPlatform = rows.reduce(
    (acc, c) => {
      acc[c.platform] = (acc[c.platform] || 0) + c.spend;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label={t("overview.detail.campaigns")} value={formatNumber(rows.length)} />
        <StatTile label={t("overview.kpi.adSpend")} value={formatCurrency(spend, currency)} />
        <StatTile
          label={t("overview.ads.colRoas")}
          value={performance?.roas != null ? `${performance.roas.toFixed(2)}×` : "—"}
        />
        <StatTile
          label={t("overview.ads.colConv")}
          value={formatNumber(analytics?.totalConversions ?? rows.reduce((s, c) => s + c.conversions, 0))}
        />
      </div>

      {analytics?.portfolioGrade && analytics.portfolioGrade !== "—" ? (
        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-sm">
          <p className="font-medium">
            {t("overview.detail.portfolioGrade", { grade: analytics.portfolioGrade })}
          </p>
          {analytics.portfolioReasons[0] ? (
            <p className="text-xs text-muted-foreground mt-1">{analytics.portfolioReasons[0]}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{t("overview.detail.spendByPlatform")}</p>
        <BreakdownBars
          data={{
            ...(byPlatform.meta_business ? { Meta: byPlatform.meta_business } : {}),
            ...(byPlatform.google_ads ? { Google: byPlatform.google_ads } : {}),
          }}
          total={spend || 1}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link to="/marketing">{t("overview.openMarketing")}</Link>
        </Button>
        {poor.length > 0 ? (
          <Badge variant="secondary" className="font-normal">
            {t("overview.detail.needsReview", { count: poor.length })}
          </Badge>
        ) : null}
      </div>

      <div className="overflow-x-auto -mx-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.ads.colName")}</TableHead>
              <TableHead className="text-right">{t("overview.ads.colSpend")}</TableHead>
              <TableHead className="text-right">{t("overview.ads.colRoas")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 40).map((c) => {
              const needsReview = poor.some((p) => p.id === c.id && p.platform === c.platform);
              return (
                <TableRow key={`${c.platform}-${c.id}`}>
                  <TableCell className="max-w-[180px]">
                    <p className="font-medium truncate text-sm">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.platform === "meta_business" ? t("overview.ads.meta") : t("overview.ads.google")}
                      {needsReview ? ` · ${t("overview.detail.reviewFlag")}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(c.spend, c.accountCurrency || currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.roas != null ? c.roas.toFixed(2) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SalesDetail({
  shopifyData,
  storeCurrency,
  businessProfileId,
  query,
  onOpenTab,
  onFilterStaleUnfulfilled,
  onFilterPendingPayments,
  onExportOrders,
}: Props & { query: string }) {
  const { t } = useTranslation("ecommerce");
  const orders = useMemo(
    () =>
      (shopifyData?.orders ?? []).filter((o) =>
        matchesQuery(`${o.name} ${o.customer || ""} ${o.email} ${o.status}`, query)
      ),
    [shopifyData?.orders, query]
  );
  const stats = shopifyData?.stats;
  const fulfill = fulfillmentBreakdown(orders);
  const payment = paymentBreakdown(orders);
  const sum = orders.reduce((s, o) => s + o.total, 0);
  const abandoned = (shopifyData?.abandonedCheckouts ?? []).filter((c) =>
    matchesQuery(`${c.email}`, query)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label={t("overview.kpi.revenue")}
          value={formatCurrency(stats?.revenue30d ?? sum, storeCurrency)}
        />
        <StatTile
          label={t("overview.kpi.sales")}
          value={formatNumber(stats?.ordersWindow ?? orders.length)}
        />
        <StatTile
          label={t("insights.avgOrderValue")}
          value={formatCurrency(stats?.avgOrderValue ?? 0, storeCurrency)}
        />
        <StatTile
          label={t("overview.detail.fulfillmentRate")}
          value={stats?.fulfillmentRate30d != null ? `${stats.fulfillmentRate30d}%` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("overview.detail.byFulfillment")}</p>
          <BreakdownBars data={fulfill} total={orders.length || 1} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("overview.detail.byPayment")}</p>
          <BreakdownBars data={payment} total={orders.length || 1} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onOpenTab("orders")}>
          {t("overview.openOrders")}
        </Button>
        {onFilterStaleUnfulfilled ? (
          <Button type="button" size="sm" variant="outline" onClick={onFilterStaleUnfulfilled}>
            {t("overview.detail.actionStale")}
          </Button>
        ) : null}
        {onFilterPendingPayments ? (
          <Button type="button" size="sm" variant="outline" onClick={onFilterPendingPayments}>
            {t("overview.detail.actionPending")}
          </Button>
        ) : null}
        {onExportOrders ? (
          <Button type="button" size="sm" variant="outline" onClick={onExportOrders}>
            <Download className="h-3.5 w-3.5 mr-1" />
            {t("overview.detail.exportCsv")}
          </Button>
        ) : null}
      </div>

      {abandoned.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">{t("overview.detail.abandonedHeading")}</p>
          {abandoned.slice(0, 6).map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-border/50 px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{c.email || "—"}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(c.total, c.currency || storeCurrency)} · {formatDate(c.createdAt)}
                </p>
              </div>
              {businessProfileId ? (
                <AbandonedCheckoutRecoveryButton
                  businessProfileId={businessProfileId}
                  email={c.email}
                  cartTotal={c.total}
                  currency={c.currency || storeCurrency}
                  businessName={shopifyData?.shop?.name}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto -mx-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.sales.colOrder")}</TableHead>
              <TableHead className="text-right">{t("overview.sales.colTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.slice(0, 40).map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <p className="font-medium text-sm">{o.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {o.customer || o.email || "—"} · {o.status}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(o.total, o.currency || storeCurrency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PurchasesDetail({
  snapshot,
  suppliers,
  purchaseCurrency,
  query,
}: Props & { query: string }) {
  const { t } = useTranslation("ecommerce");
  const rows = useMemo(
    () =>
      (suppliers?.invoices ?? []).filter((inv) =>
        matchesQuery(`${inv.supplierName} ${inv.invoiceNumber}`, query)
      ),
    [suppliers?.invoices, query]
  );
  const margin =
    snapshot && snapshot.revenue > 0
      ? ((snapshot.revenue - snapshot.costs) / snapshot.revenue) * 100
      : null;

  return (
    <div className="space-y-4">
      {snapshot ? (
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label={t("overview.purchases.costs")}
            value={formatCurrency(snapshot.costs, purchaseCurrency)}
          />
          <StatTile
            label={t("overview.purchases.revenue")}
            value={formatCurrency(snapshot.revenue, purchaseCurrency)}
          />
          <StatTile
            label={t("overview.purchases.result")}
            value={formatCurrency(snapshot.resultEstimate, purchaseCurrency)}
          />
          <StatTile
            label={t("overview.detail.margin")}
            value={margin != null ? `${Math.round(margin)}%` : "—"}
          />
        </div>
      ) : null}

      {suppliers ? (
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label={t("overview.detail.unpaidInvoices")}
            value={formatNumber(suppliers.unpaidCount)}
            hint={formatCurrency(suppliers.unpaidSum, purchaseCurrency)}
          />
          <StatTile
            label={t("overview.detail.overdueInvoices")}
            value={formatNumber(suppliers.overdueCount)}
            hint={formatCurrency(suppliers.overdueSum, purchaseCurrency)}
          />
        </div>
      ) : null}

      {!snapshot && !suppliers ? (
        <div className="text-center space-y-3 py-4">
          <p className="text-sm text-muted-foreground">{t("overview.purchases.empty")}</p>
          <Button size="sm" asChild>
            <Link to="/connections?session=fortnox">{t("overview.purchases.connect")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link to="/company?tab=economy">{t("overview.openEconomy")}</Link>
          </Button>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="overflow-x-auto -mx-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.purchases.colSupplier")}</TableHead>
                <TableHead className="text-right">{t("overview.purchases.colBalance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 40).map((inv) => (
                <TableRow key={inv.givenNumber || inv.invoiceNumber}>
                  <TableCell>
                    <p className="font-medium text-sm truncate">{inv.supplierName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {inv.invoiceNumber || "—"} · {inv.dueDate || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(inv.balance, inv.currency || purchaseCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

/** Helpers re-exported for OverviewTab campaign flattening. */
export function flattenCampaignMetrics(
  campaign: {
    id: string;
    name: string;
    status: string;
    platform: "meta_business" | "google_ads";
    accountName: string;
    accountCurrency?: string;
  } & Parameters<typeof campaignSpend>[0]
): FlatCampaignRow {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    platform: campaign.platform,
    accountName: campaign.accountName,
    accountCurrency: campaign.accountCurrency,
    spend: campaignSpend(campaign),
    conversions: campaignConversions(campaign),
    value: campaignValue(campaign),
    roas: campaignRoas(campaign),
    clicks: campaignClicks(campaign),
    impressions: campaignImpressions(campaign),
  };
}
