import { m } from "framer-motion";
import {
  ShoppingCart,
  Package,
  RefreshCw,
  Loader2,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  FileText,
  Database,
  ExternalLink,
  Users,
  AlertTriangle,
  Tag,
  Receipt,
  Box,
  ArrowUpRight,
  ChevronDown,
  Download,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { AutomationEnableHint } from "@/features/automation";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { NotionIcon, ShopifyIcon } from "@/components/platform-icons";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { formatCurrency, formatNumber } from "@/lib/format";
import { AlibabaImportCard } from "@/features/ecommerce/AlibabaImportCard";
import { ProductsTab } from "@/features/ecommerce/ProductsTab";
import { AbandonedCheckoutRecoveryButton } from "@/features/ecommerce/AbandonedCheckoutRecoveryButton";
import { useLeads } from "@/features/leads";
import { alibabaImportToInput } from "@/lib/productStore";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  importShopifyProducts,
} from "@/lib/productsApi";
import type { Product, ProductInput, AlibabaProductImport } from "@/types/ecommerce";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { toast } from "sonner";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { apiJson } from "@/lib/apiJson";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { downloadCsv, shopifyOrdersToCsv } from "@/lib/exportCsv";
import {
  formatPromoValue,
  statusColors,
  fulfillmentColors,
  paymentStatusLabel,
  fulfillmentStatusLabel,
  orderFiltersStorageKey,
  readPersistedOrderFilters,
} from "@/features/ecommerce/orderDisplay";
import {
  sortOrgAccounts,
  isShopifyData,
  isNotionData,
  formatDate,
  formatChartDate,
  type OrganizationData,
  type NotionParentOption,
} from "@/features/ecommerce/ecommerceOrg";

const revenueChartConfig: ChartConfig = {
  revenue: {
    label: "Intäkter",
    color: "hsl(var(--primary, 142 76% 36%))",
  },
};

/** Unfulfilled orders older than this are flagged in the action strip. */
const STALE_UNFULFILLED_DAYS = 2;

export default function Ecommerce() {
  const { authMode } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, getSelectedAccountId, setSelectedAccountId, activeProfileId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const productProfileId = activeBusinessProfileId ?? activeProfileId;
  const { createLead } = useLeads(productProfileId);
  const selectedAccountId = getSelectedAccountId("ecommerce");
  const [initialOrganizationData] = useState<OrganizationData>(null);
  const {
    scopedAccounts: orgAccounts,
    activeAccount: activeOrgAccount,
    data,
    loading,
    error,
    setError,
    refresh,
  } = useAccountData<OrganizationData>({
    accounts,
    selectedAccountId,
    setSelectedAccountId: (id) => setSelectedAccountId("ecommerce", id),
    accountFilter: (a) => (a.platform === "shopify" || a.platform === "notion") && Boolean(a.isOAuth),
    initialData: initialOrganizationData,
    requestKey: activeBusinessProfileId ?? activeProfileId,
    scopeSort: sortOrgAccounts,
    fetcher: async (accountId) => {
      const res = await fetchWithTimeout(accountDataUrl(accountId, activeBusinessProfileId ?? activeProfileId), { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(d, "Kunde inte hämta butiksdata."));
      }
      return res.json();
    },
  });
  const [searchParams, setSearchParams] = useSearchParams();
  type EcommerceTab = "orders" | "products" | "insights" | "tools";
  const ECOMMERCE_TABS: EcommerceTab[] = ["orders", "products", "insights", "tools"];
  const rawEcommerceTab = searchParams.get("tab");
  const tab: EcommerceTab =
    rawEcommerceTab === "overview"
      ? "orders"
      : rawEcommerceTab && (ECOMMERCE_TABS as string[]).includes(rawEcommerceTab)
        ? (rawEcommerceTab as EcommerceTab)
        : "orders";

  function setTab(next: EcommerceTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "orders") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  const [notionParentId, setNotionParentId] = useState("");
  const [notionParentType, setNotionParentType] = useState<"page_id" | "database_id">("page_id");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionContent, setNotionContent] = useState("");
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionWriteMessage, setNotionWriteMessage] = useState<string | null>(null);
  const [notionOpen, setNotionOpen] = useState(false);
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>(
    () => readPersistedOrderFilters(activeBusinessProfileId ?? activeProfileId).payment
  );
  const [orderFulfillmentFilter, setOrderFulfillmentFilter] = useState<string>(
    () => readPersistedOrderFilters(activeBusinessProfileId ?? activeProfileId).fulfillment
  );
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Persist the chosen order filters per profile so they survive reloads.
  // The hydrated-key guard prevents a profile switch from overwriting the new
  // profile's stored filters with the previous profile's values.
  const filterProfileKey = activeBusinessProfileId ?? activeProfileId;
  const hydratedFilterKeyRef = useRef<string | null>(filterProfileKey);
  useEffect(() => {
    if (hydratedFilterKeyRef.current !== filterProfileKey) {
      const stored = readPersistedOrderFilters(filterProfileKey);
      setOrderPaymentFilter(stored.payment);
      setOrderFulfillmentFilter(stored.fulfillment);
      hydratedFilterKeyRef.current = filterProfileKey;
    }
  }, [filterProfileKey]);
  useEffect(() => {
    if (hydratedFilterKeyRef.current !== filterProfileKey) return;
    try {
      localStorage.setItem(
        orderFiltersStorageKey(filterProfileKey),
        JSON.stringify({ payment: orderPaymentFilter, fulfillment: orderFulfillmentFilter })
      );
    } catch {
      /* storage unavailable — filters just won't persist */
    }
  }, [filterProfileKey, orderPaymentFilter, orderFulfillmentFilter]);

  function handleRefresh() {
    void refresh();
  }

  const activeNotion = activeOrgAccount?.platform === "notion" ? activeOrgAccount : null;
  const shopifyAccount = useMemo(
    () => orgAccounts.find((account) => account.platform === "shopify") || null,
    [orgAccounts]
  );
  const shopifyData = isShopifyData(data) ? data : null;
  const notionData = isNotionData(data) ? data : null;

  const filteredOrders = useMemo(() => {
    if (!shopifyData) return [];
    return shopifyData.orders.filter((order) => {
      if (orderPaymentFilter !== "all" && order.status !== orderPaymentFilter) return false;
      if (orderFulfillmentFilter !== "all") {
        const fulfillment = order.fulfillment || "unfulfilled";
        if (fulfillment !== orderFulfillmentFilter) return false;
      }
      return true;
    });
  }, [shopifyData, orderPaymentFilter, orderFulfillmentFilter]);

  const orderPaymentOptions = useMemo(() => {
    if (!shopifyData) return [];
    return Array.from(new Set(shopifyData.orders.map((o) => o.status).filter(Boolean)));
  }, [shopifyData]);

  const orderFulfillmentOptions = useMemo(() => {
    if (!shopifyData) return [];
    return Array.from(
      new Set(shopifyData.orders.map((o) => o.fulfillment || "unfulfilled").filter(Boolean))
    );
  }, [shopifyData]);

  /**
   * "Action needed" signals derived from the loaded Shopify window: unfulfilled
   * orders that have sat for a while, unpaid orders, and low-stock variants.
   * Each entry can apply the matching order filter so the user lands directly
   * on the rows that need work.
   */
  const actionNeeded = useMemo(() => {
    if (!shopifyData) return null;
    const staleCutoffMs = Date.now() - STALE_UNFULFILLED_DAYS * 86400000;
    const staleUnfulfilled = shopifyData.orders.filter((order) => {
      const fulfillment = order.fulfillment || "unfulfilled";
      if (fulfillment === "fulfilled" || fulfillment === "restocked") return false;
      const createdMs = Date.parse(order.createdAt);
      return Number.isFinite(createdMs) && createdMs <= staleCutoffMs;
    }).length;
    const pendingPayments = shopifyData.orders.filter(
      (order) => order.status === "pending" || order.status === "partially_paid"
    ).length;
    const lowStock = shopifyData.stats.lowStockCount;
    return { staleUnfulfilled, pendingPayments, lowStock, total: staleUnfulfilled + pendingPayments + lowStock };
  }, [shopifyData]);

  function exportOrders() {
    if (filteredOrders.length === 0) return;
    downloadCsv(
      shopifyOrdersToCsv(filteredOrders),
      `shopify-orders-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  // Product catalogue (DB-backed, scoped to the active business profile).
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [importingShopify, setImportingShopify] = useState(false);

  useEffect(() => {
    if (!productProfileId) {
      setProducts([]);
      return;
    }
    let ignore = false;
    setProductsLoading(true);
    setProductsError(null);
    fetchProducts(productProfileId)
      .then((list) => {
        if (!ignore) setProducts(list);
      })
      .catch((e) => {
        if (!ignore) setProductsError(e instanceof Error ? e.message : "Kunde inte ladda produkter.");
      })
      .finally(() => {
        if (!ignore) setProductsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [productProfileId]);

  const handleCreateProduct = useCallback(
    async (input: ProductInput) => {
      if (!productProfileId) throw new Error("Ingen aktiv profil vald.");
      const product = await createProduct(productProfileId, input);
      setProducts((prev) => [product, ...prev]);
      return product;
    },
    [productProfileId]
  );

  const handleUpdateProduct = useCallback(
    async (id: string, patch: Partial<ProductInput>) => {
      if (!productProfileId) throw new Error("Ingen aktiv profil vald.");
      const product = await updateProduct(productProfileId, id, patch);
      setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
    },
    [productProfileId]
  );

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      if (!productProfileId) throw new Error("Ingen aktiv profil vald.");
      await deleteProduct(productProfileId, id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    },
    [productProfileId]
  );

  const handleImportShopify = useCallback(async () => {
    if (!productProfileId || !shopifyAccount?.id) return;
    setImportingShopify(true);
    try {
      const result = await importShopifyProducts(productProfileId, shopifyAccount.id);
      setProducts(result.products);
      toast.success(
        `Synkade Shopify: ${result.imported} nya, ${result.updated} uppdaterade.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte importera från Shopify.");
    } finally {
      setImportingShopify(false);
    }
  }, [productProfileId, shopifyAccount?.id]);

  const handleSaveAsProduct = useCallback(
    async (imported: AlibabaProductImport) => {
      await handleCreateProduct(alibabaImportToInput(imported));
      setTab("products");
    },
    [handleCreateProduct]
  );

  useEffect(() => {
    if (notionData && activeOrgAccount?.platform === "notion") {
      setNotionOpen(true);
    }
  }, [notionData, activeOrgAccount?.platform]);

  const stats = shopifyData?.stats;
  const currency = stats?.currency || "USD";

  const statCards = useMemo(
    () =>
      stats && shopifyData
        ? [
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
          ]
        : null,
    [stats, shopifyData, currency]
  );

  const notionPageOptions = useMemo<NotionParentOption[]>(
    () =>
      notionData
        ? notionData.pages.map((page) => ({
            id: page.id,
            title: page.title || "Namnlös sida",
            type: "page_id" as const,
            lastEditedLabel: page.lastEditedTime ? formatDate(page.lastEditedTime) : "Okänt datum",
          }))
        : [],
    [notionData]
  );

  const notionDatabaseOptions = useMemo<NotionParentOption[]>(
    () =>
      notionData
        ? notionData.databases.map((db) => ({
            id: db.id,
            title: db.title || "Namnlös databas",
            type: "database_id" as const,
            lastEditedLabel: db.lastEditedTime ? formatDate(db.lastEditedTime) : "Okänt datum",
          }))
        : [],
    [notionData]
  );

  async function handleCreateNotionPage() {
    if (!activeNotion?.id || !notionParentId.trim() || !notionTitle.trim()) return;
    setNotionSaving(true);
    setNotionWriteMessage(null);
    try {
      await apiJson(`/api/notion/${activeNotion.id}/pages`, "Kunde inte skapa Notion-sida.", {
        body: {
          parentId: notionParentId.trim(),
          parentType: notionParentType,
          title: notionTitle.trim(),
          content: notionContent.trim(),
          business_profile_id: activeBusinessProfileId ?? activeProfileId,
        },
      });
      setNotionWriteMessage("Sidan skapades i Notion.");
      setNotionTitle("");
      setNotionContent("");
      void refresh();
    } catch (err) {
      setNotionWriteMessage(err instanceof Error ? err.message : "Kunde inte skapa Notion-sida.");
    } finally {
      setNotionSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={ShoppingCart}
        title="E-handel"
        description={
          shopifyData?.shop.name
            ? `${shopifyData.shop.name} · ${shopifyData.shop.domain}`
            : notionData?.workspace?.name
              ? `${notionData.workspace.name} · Notion workspace`
              : "Koppla Shopify och importera produkter från Alibaba"
        }
        actions={
          activeOrgAccount ? (
            <div className="flex items-center gap-2">
              {shopifyData?.shop.adminUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="text-muted-foreground"
                >
                  <a href={shopifyData.shop.adminUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    <span className="ml-1.5 hidden sm:inline">Öppna admin</span>
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                className="text-muted-foreground"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1.5 hidden sm:inline">Uppdatera</span>
              </Button>
            </div>
          ) : null
        }
      />

      <PageSmartBar
        title="E-handel samlar Shopify, produkter och ordrar — från lager till åtgärder som kräver uppmärksamhet."
        steps={[
          "Koppla Shopify under Kopplingar",
          "Synka produkter och följ ordrar under Översikt",
          "Importera från Alibaba eller hantera katalogen under Produkter",
        ]}
        tip="Dagliga automationer synkar ordrar och lager. Ordrar som väntar på leverans markeras i åtgärdsraden."
        liveHintOverride={
          actionNeeded && actionNeeded.total > 0
            ? `${actionNeeded.total} åtgärd${actionNeeded.total === 1 ? "" : "er"} väntar — ordrar eller lågt lager`
            : shopifyData
              ? "Inga brådskande e-handelsåtgärder just nu."
              : null
        }
      />

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <SectionConnectionStatus area="ecommerce" hideWhenHealthy />
      </m.div>

      <div className="app-workspace-shell !min-h-0">
        <div className="app-workspace-toolbar px-3 pt-1 sm:px-4">
          <PageModeTabs
            value={tab}
            aria-label="E-handelsflikar"
            onChange={setTab}
            options={[
              { value: "orders", label: "Ordrar", count: shopifyData?.orders.length },
              { value: "products", label: "Produkter", count: products.length },
              { value: "insights", label: "Insikter" },
              { value: "tools", label: "Verktyg" },
            ]}
          />
        </div>

        {(tab === "orders" || tab === "insights") ? (
        <div className="app-workspace-stats grid grid-cols-3 gap-2 px-3 py-2 sm:px-4">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Produkter</p>
            <p className="text-xs font-semibold tabular-nums">{products.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Ordrar</p>
            <p className="text-xs font-semibold tabular-nums">{shopifyData?.orders.length ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Åtgärder</p>
            <p className={`text-xs font-semibold tabular-nums ${actionNeeded && actionNeeded.total > 0 ? "text-warning" : ""}`}>
              {actionNeeded ? actionNeeded.total : "—"}
            </p>
          </div>
        </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto space-y-8 p-3 sm:p-4">

      {tab === "products" && (
        <div className="space-y-8">
          <ProductsTab
            businessProfileId={activeProfileId}
            products={products}
            loading={productsLoading}
            error={productsError}
            shopifyAccountId={shopifyAccount?.id ?? null}
            importingShopify={importingShopify}
            onCreate={handleCreateProduct}
            onUpdate={handleUpdateProduct}
            onDelete={handleDeleteProduct}
            onImportShopify={handleImportShopify}
          />
        </div>
      )}

      {(tab === "orders" || tab === "insights" || tab === "tools") && (
      <div className="space-y-8">
      {authMode === "local" && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Lokalt läge är aktivt. OAuth/koppling är påslaget för lokal testning och data stannar i din nuvarande session.
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* OAuth error */}
      {oauthErrorDetails && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(oauthErrorDetails)}
            onDismiss={clearOauthError}
            platform="shopify"
          />
        </m.div>
      )}

      {/* Account switcher */}
      {orgAccounts.length > 1 && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
          {orgAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId("ecommerce", acc.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeOrgAccount?.id === acc.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {acc.username} · {acc.platform === "shopify" ? "Shopify" : "Notion"}
            </button>
          ))}
        </m.div>
      )}

      {orgAccounts.length === 0 && (
        <m.div
          {...fadeUp}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-3"
        >
          <EmptyState
            icon={ShoppingBag}
            title="Koppla Shopify"
            description={
              tab === "tools"
                ? "Koppla Shopify för ordrar och lager. Importera från Alibaba eller använd Notion under Verktyg."
                : tab === "insights"
                  ? "Koppla Shopify för att se intäkter, topsäljare och kampanjdata."
                  : "Koppla din Shopify-butik för att se och hantera ordrar här."
            }
            action={
              <Button asChild className="glow-sm">
                <Link to="/connections?q=shopify">
                  <ShopifyIcon className="h-4 w-4 mr-2" />
                  Öppna Kopplingar
                </Link>
              </Button>
            }
          />
          <p className="text-xs text-muted-foreground/60 text-center max-w-lg mx-auto">
            Kopplingar är hemmet för alla integrationer. Notion kopplas också där.
          </p>
        </m.div>
      )}

      {/* Fetch error */}
      {error && activeOrgAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>Stäng</Button>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="bg-card border-border">
                <CardContent className="p-5 space-y-3">
                  <div className="h-5 w-5 rounded bg-secondary animate-pulse" />
                  <div className="h-7 w-2/3 rounded bg-secondary animate-pulse" />
                  <div className="h-4 w-1/2 rounded bg-secondary/60 animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <div className="h-4 w-16 rounded bg-secondary animate-pulse" />
                  <div className="h-4 w-32 rounded bg-secondary animate-pulse" />
                  <div className="h-4 flex-1 rounded bg-secondary/60 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-secondary animate-pulse" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action needed strip */}
      {tab === "orders" && !loading && shopifyData && actionNeeded && (
        <m.div {...fadeUp} transition={{ duration: 0.35, delay: 0.03 }}>
          {actionNeeded.total === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 text-sm text-muted-foreground">
              <Package className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
              <span>Allt under kontroll — inga ordrar eller lagernivåer behöver åtgärdas just nu.</span>
            </div>
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  {actionNeeded.total} {actionNeeded.total === 1 ? "sak behöver" : "saker behöver"} åtgärdas
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {actionNeeded.staleUnfulfilled > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("orders");
                      setOrderPaymentFilter("all");
                      setOrderFulfillmentFilter("unfulfilled");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 transition-colors"
                  >
                    <Package className="h-3 w-3" aria-hidden />
                    {actionNeeded.staleUnfulfilled} ej skickade &gt;{STALE_UNFULFILLED_DAYS} dagar
                  </button>
                )}
                {actionNeeded.pendingPayments > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("orders");
                      setOrderPaymentFilter("pending");
                      setOrderFulfillmentFilter("all");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                  >
                    <Receipt className="h-3 w-3" aria-hidden />
                    {actionNeeded.pendingPayments} väntande betalningar
                  </button>
                )}
                {actionNeeded.lowStock > 0 && (
                  <a
                    href={shopifyData.adminLinks.products}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Box className="h-3 w-3" aria-hidden />
                    {actionNeeded.lowStock} varianter med lågt lager
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </div>
          )}
        </m.div>
      )}

      {/* Stats cards */}
      {tab === "insights" && !loading && statCards && (
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
      )}

      {/* Revenue trend */}
      {tab === "insights" && !loading && shopifyData && shopifyData.revenueTrend.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Intäktstrend
              </CardTitle>
              <CardDescription>
                Senaste 30 dagarna · Totalt {formatCurrency(shopifyData.stats.revenue30d, currency, { detailed: true })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={revenueChartConfig} className="aspect-[16/5] w-full">
                <AreaChart data={shopifyData.revenueTrend} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
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
      )}

      {/* Insight row: top products + top customers */}
      {tab === "insights" && !loading && shopifyData && (shopifyData.topProducts.length > 0 || shopifyData.topCustomers.length > 0) && (
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
                          onClick={() => {
                            void createLead({
                              company: customer.name,
                              contactName: customer.name,
                              email: customer.email,
                              source: "shopify-customer",
                              status: "qualified",
                              notes: `Totalt spenderat: ${formatCurrency(customer.totalSpent, customer.currency || currency)} · ${customer.ordersCount} ordrar`,
                            }).then(() => toast.success("Tillagd i leads"));
                          }}
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

      {/* Operational alerts: abandoned + low stock */}
      {tab === "orders" && !loading && shopifyData && (shopifyData.abandonedCheckouts.length > 0 || shopifyData.lowStock.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shopifyData.abandonedCheckouts.length > 0 && (
            <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Receipt className="h-5 w-5 text-orange-500" />
                        Övergivna varukorgar
                      </CardTitle>
                      <CardDescription>
                        {shopifyData.stats.abandonedCheckouts30d} varukorgar · {formatCurrency(shopifyData.stats.abandonedValue30d, currency, { detailed: true })} i riskzonen
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={shopifyData.adminLinks.checkouts} target="_blank" rel="noreferrer" className="text-muted-foreground">
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <AutomationEnableHint
                    className="mt-3"
                    compact
                    tab="reports"
                    focus="cart-recovery"
                    title="Automatisera återvinning"
                    description="Kundvagnsåtervinning skickar återhämtningsmail på schema — du slipper klicka per varukorg."
                    ctaLabel="Slå på kundvagnsåtervinning"
                  />
                </CardHeader>
                <CardContent className="space-y-2">
                  {shopifyData.abandonedCheckouts.map((checkout) => (
                    <div
                      key={checkout.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{checkout.email || "Anonym"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(checkout.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(checkout.total, checkout.currency)}
                        </p>
                        <AbandonedCheckoutRecoveryButton
                          businessProfileId={productProfileId}
                          email={checkout.email}
                          cartTotal={checkout.total}
                          currency={checkout.currency}
                          businessName={shopifyData.shop?.name}
                        />
                        {checkout.recoveryUrl && (
                          <a
                            href={checkout.recoveryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="Öppna återställningslänk"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </m.div>
          )}

          {shopifyData.lowStock.length > 0 && (
            <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.35 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        Lågt lager
                      </CardTitle>
                      <CardDescription>Varianter med högst 5 enheter i lager</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={shopifyData.adminLinks.products} target="_blank" rel="noreferrer" className="text-muted-foreground">
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {shopifyData.lowStock.map((item) => (
                    <div
                      key={`${item.productId}-${item.sku ?? item.variantTitle ?? "default"}`}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.productTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[item.variantTitle, item.sku].filter(Boolean).join(" · ") || "Standardvariant"}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          item.quantity <= 0
                            ? "bg-red-500/15 text-red-500"
                            : item.quantity <= 2
                              ? "bg-orange-500/15 text-orange-500"
                              : "bg-yellow-500/15 text-yellow-600"
                        }`}
                      >
                        {item.quantity} kvar
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </m.div>
          )}
        </div>
      )}

      {/* Active promotions */}
      {tab === "insights" && !loading && shopifyData && shopifyData.promotions.length > 0 && (
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

      {tab === "orders" && !loading && shopifyData && shopifyData.orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga ordrar hämtade ännu. Uppdatera eller kontrollera Shopify-kopplingen.</p>
      ) : null}

      {/* Recent orders */}
      {tab === "orders" && !loading && shopifyData && shopifyData.orders.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.45 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShoppingCart className="h-5 w-5" />
                    Senaste ordrar
                  </CardTitle>
                  <CardDescription>
                    {filteredOrders.length} visas · {shopifyData.orders.length} laddade
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <Select value={orderPaymentFilter} onValueChange={setOrderPaymentFilter}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-[130px]">
                      <SelectValue placeholder="Betalning" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla betalningar</SelectItem>
                      {orderPaymentOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {paymentStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={orderFulfillmentFilter} onValueChange={setOrderFulfillmentFilter}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-[130px]">
                      <SelectValue placeholder="Leverans" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla leveranser</SelectItem>
                      {orderFulfillmentOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {fulfillmentStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportOrders} disabled={filteredOrders.length === 0}>
                    <Download className="h-4 w-4 mr-1.5" />
                    Exportera CSV
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={shopifyData.adminLinks.orders} target="_blank" rel="noreferrer" className="text-muted-foreground">
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {filteredOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Inga ordrar matchar filtren.</p>
                ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left px-5 py-3 font-medium">Order</th>
                      <th className="text-left px-3 py-3 font-medium">Kund</th>
                      <th className="text-left px-3 py-3 font-medium">Rader</th>
                      <th className="text-left px-3 py-3 font-medium">Betalning</th>
                      <th className="text-left px-3 py-3 font-medium">Leverans</th>
                      <th className="text-right px-5 py-3 font-medium">Totalt</th>
                      <th className="text-right px-5 py-3 font-medium">Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, i) => {
                      const orderId = String(order.id);
                      const isExpanded = expandedOrderId === orderId;
                      const lineItems = order.lineItems ?? [];
                      return (
                        <Fragment key={order.id}>
                          <m.tr
                            {...fadeUp}
                            transition={{ duration: 0.3, delay: i * 0.03 }}
                            onClick={() => setExpandedOrderId(isExpanded ? null : orderId)}
                            className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                            aria-expanded={isExpanded}
                          >
                            <td className="px-5 py-3 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                                  aria-hidden
                                />
                                {order.name}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground truncate max-w-[140px]">
                              {order.customer || order.email || "—"}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{order.lineItemCount}</td>
                            <td className="px-3 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] ?? "bg-muted text-muted-foreground"}`}>
                                {paymentStatusLabel(order.status)}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fulfillmentColors[order.fulfillment] ?? "bg-muted text-muted-foreground"}`}>
                                {fulfillmentStatusLabel(order.fulfillment || "unfulfilled")}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-medium">
                              {formatCurrency(order.total, order.currency)}
                            </td>
                            <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                              {formatDate(order.createdAt)}
                            </td>
                          </m.tr>
                          {isExpanded ? (
                            <tr className="border-b border-border/50 last:border-0 bg-muted/20">
                              <td colSpan={7} className="px-5 py-3">
                                {lineItems.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Radinformation saknas för den här ordern — uppdatera sidan för att hämta den.
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {lineItems.map((item, itemIndex) => (
                                      <div
                                        key={item.id ?? `${orderId}-item-${itemIndex}`}
                                        className="flex items-center justify-between gap-3 text-xs"
                                      >
                                        <span className="min-w-0 truncate text-foreground">
                                          {item.title}
                                          {item.variantTitle ? (
                                            <span className="text-muted-foreground"> · {item.variantTitle}</span>
                                          ) : null}
                                        </span>
                                        <span className="shrink-0 tabular-nums text-muted-foreground">
                                          {item.quantity} × {formatCurrency(item.price, order.currency, { detailed: true })}
                                        </span>
                                      </div>
                                    ))}
                                    {order.lineItemCount > lineItems.length ? (
                                      <p className="text-[11px] text-muted-foreground/70">
                                        +{order.lineItemCount - lineItems.length} fler rader — se ordern i Shopify admin.
                                      </p>
                                    ) : null}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {tab === "tools" ? (
        <>
          <m.div {...fadeUp} transition={{ duration: 0.35 }}>
            <McpFeatureSection
              businessProfileId={activeBusinessProfileId ?? activeProfileId}
              featureIds={MCP_PAGE_FEATURE_IDS.ecommerce}
              title="Shopify-katalog (MCP)"
              description="Fråga din kopplade Shopify-butik via MCP. Kräver butiksdomän vid koppling."
            />
          </m.div>
          <m.div {...fadeUp} transition={{ duration: 0.35 }}>
            <AlibabaImportCard
              businessProfileId={activeProfileId}
              shopifyAccountId={shopifyAccount?.id ?? null}
              onSaveAsProduct={handleSaveAsProduct}
            />
          </m.div>
        </>
      ) : null}

      {/* Store plan info */}
      {tab === "tools" && !loading && shopifyData?.shop && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
          <Card className="bg-card border-border">
            <CardContent className="py-4 px-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span><span className="text-foreground font-medium">Butik:</span> {shopifyData.shop.name}</span>
              <span>
                <span className="text-foreground font-medium">Domän:</span>{" "}
                <a href={shopifyData.shop.storefrontUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                  {shopifyData.shop.domain}
                </a>
              </span>
              {shopifyData.shop.plan && <span><span className="text-foreground font-medium">Plan:</span> {shopifyData.shop.plan}</span>}
              {shopifyData.shop.currency && <span><span className="text-foreground font-medium">Valuta:</span> {shopifyData.shop.currency}</span>}
              {shopifyData.shop.country && <span><span className="text-foreground font-medium">Land:</span> {shopifyData.shop.country}</span>}
              {shopifyData.shop.timezone && <span><span className="text-foreground font-medium">Tidszon:</span> {shopifyData.shop.timezone}</span>}
              {shopifyData.shop.email && <span><span className="text-foreground font-medium">E-post:</span> {shopifyData.shop.email}</span>}
            </CardContent>
          </Card>
        </m.div>
      )}

      {tab === "tools" && !loading && notionData && (
        <Collapsible open={notionOpen} onOpenChange={setNotionOpen}>
          <m.div {...fadeUp} transition={{ duration: 0.35 }}>
            <Card className="bg-card border-border">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/20 transition-colors"
                >
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <NotionIcon className="h-4 w-4" />
                      Notion workspace (valfritt)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notionData.workspace.name || "Kopplat workspace"} · {notionData.stats.pagesCount} sidor
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notionOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 px-6 pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-muted-foreground">Sidor hittade</p>
                    <p className="text-2xl font-bold">{notionData.stats.pagesCount}</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-muted-foreground">Databaser hittade</p>
                    <p className="text-2xl font-bold">{notionData.stats.databasesCount}</p>
                  </div>
                </div>

                {notionData.pages.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Senaste Notion-sidorna
                    </p>
                    {notionData.pages.map((page) => (
                      <a
                        key={page.id}
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{page.title || "Namnlös"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {page.lastEditedTime ? formatDate(page.lastEditedTime) : "Okänt datum"}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Skapa Notion-sida
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Dela först föräldersidan/databasen med din integration i Notion.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-parent-select">Välj förälder (valfritt)</Label>
                    <select
                      id="notion-parent-select"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={notionParentId ? `${notionParentType}:${notionParentId}` : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        const [type, id] = value.split(":", 2);
                        if (!id) return;
                        setNotionParentType(type === "database_id" ? "database_id" : "page_id");
                        setNotionParentId(id);
                      }}
                    >
                      <option value="">Välj en sida eller databas...</option>
                      {notionPageOptions.length > 0 && (
                        <optgroup label={`Sidor (${notionPageOptions.length})`}>
                          {notionPageOptions.map((option) => (
                            <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                              {option.title} - {option.lastEditedLabel}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {notionDatabaseOptions.length > 0 && (
                        <optgroup label={`Databaser (${notionDatabaseOptions.length})`}>
                          {notionDatabaseOptions.map((option) => (
                            <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                              {option.title} - {option.lastEditedLabel}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-parent-id">Förälder-ID</Label>
                    <Input
                      id="notion-parent-id"
                      placeholder="sid- eller databas-id"
                      value={notionParentId}
                      onChange={(e) => setNotionParentId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-parent-type">Föräldertyp</Label>
                    <select
                      id="notion-parent-type"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={notionParentType}
                      onChange={(e) => setNotionParentType(e.target.value === "database_id" ? "database_id" : "page_id")}
                    >
                      <option value="page_id">Sida</option>
                      <option value="database_id">Databas</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-page-title">Titel</Label>
                    <Input
                      id="notion-page-title"
                      placeholder="Veckoplanering"
                      value={notionTitle}
                      onChange={(e) => setNotionTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-page-content">Innehåll (valfritt)</Label>
                    <Input
                      id="notion-page-content"
                      placeholder="Första stycket på sidan"
                      value={notionContent}
                      onChange={(e) => setNotionContent(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCreateNotionPage}
                      disabled={notionSaving || !notionParentId.trim() || !notionTitle.trim() || !activeNotion}
                    >
                      {notionSaving ? "Skapar…" : "Skapa i Notion"}
                    </Button>
                    {notionWriteMessage ? (
                      <p className="text-xs text-muted-foreground">{notionWriteMessage}</p>
                    ) : null}
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </m.div>
        </Collapsible>
      )}
      </div>
      )}

        </div>
      </div>

    </div>
  );
}
