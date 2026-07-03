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
  LayoutDashboard,
  Boxes,
  Download,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { NotionIcon, ShopifyIcon } from "@/components/platform-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";

import { apiUrl } from "@/lib/apiBase";
import type { ConnectedAccount } from "@/types/accounts";
import { AlibabaImportCard } from "@/features/ecommerce/AlibabaImportCard";
import { ProductsTab } from "@/features/ecommerce/ProductsTab";
import { ShopifyConnectGuide } from "@/features/ecommerce/ShopifyConnectGuide";
import { normalizeShopifyShopDomain, SHOPIFY_DOMAIN_EXAMPLE } from "@/features/ecommerce/shopifyConnect";
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
import { accountDataUrl } from "@/lib/accountDataUrl";
import { downloadCsv, shopifyOrdersToCsv } from "@/lib/exportCsv";

function sortOrgAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "shopify" ? 0 : p === "notion" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

interface ShopifyStats {
  ordersCount: number;
  ordersWindow: number;
  productsCount: number;
  customersCount: number;
  newCustomers30d: number;
  revenue30d: number;
  avgOrderValue: number;
  abandonedCheckouts30d: number;
  abandonedValue30d: number;
  fulfillmentRate30d: number | null;
  conversionEstimate30d: number | null;
  lowStockCount: number;
  activePromotions: number;
  currency: string;
}

interface ShopifyOrder {
  id: number | string;
  name: string;
  email: string;
  customer: string | null;
  total: number;
  subtotal: number;
  discount: number;
  currency: string;
  status: string;
  fulfillment: string;
  createdAt: string;
  lineItemCount: number;
}

interface TopProduct {
  productId: number | string | null;
  title: string;
  quantity: number;
  revenue: number;
}

interface TopCustomer {
  id: number | string;
  name: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
  currency: string;
}

interface AbandonedCheckout {
  id: number | string;
  email: string;
  total: number;
  currency: string;
  createdAt: string | undefined;
  recoveryUrl: string | null;
}

interface LowStockItem {
  productId: number | string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
}

interface Promotion {
  id: number | string;
  title: string;
  value: string | null;
  valueType: string | null;
  targetType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usageCount: number;
}

interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

interface ShopifyData {
  shop: {
    name: string;
    domain: string;
    myshopifyDomain: string;
    currency: string;
    plan: string | null;
    email: string | null;
    country: string | null;
    timezone: string | null;
    primaryLocale: string | null;
    adminUrl: string;
    storefrontUrl: string;
  };
  stats: ShopifyStats;
  orders: ShopifyOrder[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  abandonedCheckouts: AbandonedCheckout[];
  lowStock: LowStockItem[];
  promotions: Promotion[];
  revenueTrend: RevenuePoint[];
  adminLinks: {
    orders: string;
    products: string;
    customers: string;
    analytics: string;
    discounts: string;
    checkouts: string;
  };
}

interface NotionEntry {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
}

interface NotionData {
  workspace: { name: string; type: string; botId: string };
  stats: { pagesCount: number; databasesCount: number };
  pages: NotionEntry[];
  databases: NotionEntry[];
  canWrite: boolean;
}

interface NotionParentOption {
  id: string;
  title: string;
  type: "page_id" | "database_id";
  lastEditedLabel: string;
}

type OrganizationData = ShopifyData | NotionData | null;

function isShopifyData(data: OrganizationData): data is ShopifyData {
  return Boolean(data && "shop" in data && "orders" in data);
}

function isNotionData(data: OrganizationData): data is NotionData {
  return Boolean(data && "workspace" in data && "pages" in data);
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatCurrencyDetailed(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
}

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function formatChartDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function formatPromoValue(value: string | null, valueType: string | null) {
  if (!value) return "—";
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return value;
  if (valueType === "percentage") return `${Math.abs(numeric)}%`;
  return formatCurrency(Math.abs(numeric), "USD");
}

const statusColors: Record<string, string> = {
  paid: "bg-green-500/15 text-green-600",
  pending: "bg-yellow-500/15 text-yellow-600",
  refunded: "bg-red-500/15 text-red-500",
  voided: "bg-muted text-muted-foreground",
  partially_paid: "bg-blue-500/15 text-blue-500",
};

const fulfillmentColors: Record<string, string> = {
  fulfilled: "bg-green-500/15 text-green-600",
  unfulfilled: "bg-orange-500/15 text-orange-500",
  partial: "bg-yellow-500/15 text-yellow-600",
  restocked: "bg-muted text-muted-foreground",
};

const revenueChartConfig: ChartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--primary, 142 76% 36%))",
  },
};

export default function Ecommerce() {
  const { authMode } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, getSelectedAccountId, setSelectedAccountId, activeProfileId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
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
        throw new Error(apiErrorMessage(d, "Could not fetch store data."));
      }
      return res.json();
    },
  });
  const [tab, setTab] = useState<"overview" | "products">("overview");
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [shopDomainError, setShopDomainError] = useState<string | null>(null);
  const [notionParentId, setNotionParentId] = useState("");
  const [notionParentType, setNotionParentType] = useState<"page_id" | "database_id">("page_id");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionContent, setNotionContent] = useState("");
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionWriteMessage, setNotionWriteMessage] = useState<string | null>(null);
  const [notionOpen, setNotionOpen] = useState(false);
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>("all");
  const [orderFulfillmentFilter, setOrderFulfillmentFilter] = useState<string>("all");

  function handleConnect() {
    setShopDomain("");
    setShopDomainError(null);
    setConnectDialogOpen(true);
  }

  function handleConnectSubmit() {
    const shop = normalizeShopifyShopDomain(shopDomain);
    if (!shop) {
      setShopDomainError(`Ange butikens .myshopify.com-domän, till exempel ${SHOPIFY_DOMAIN_EXAMPLE}.`);
      return;
    }
    const params = new URLSearchParams({ shop });
    params.set("app_origin", window.location.origin);
    appendOAuthProfileParams(params, activeProfileId);
    setConnectDialogOpen(false);
    setShopDomain("");
    setShopDomainError(null);
    window.location.href = `${apiUrl("/api/auth/shopify")}?${params}`;
  }

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

  function exportOrders() {
    if (filteredOrders.length === 0) return;
    downloadCsv(
      shopifyOrdersToCsv(filteredOrders),
      `shopify-orders-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  // Product catalogue (DB-backed, scoped to the active business profile).
  const productProfileId = activeBusinessProfileId;
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
              label: "Revenue (30 days)",
              value: formatCurrency(stats.revenue30d, currency),
              icon: DollarSign,
              sub: `${stats.ordersWindow.toLocaleString("en-US")} orders in window`,
            },
            {
              label: "Avg. order value",
              value: formatCurrency(stats.avgOrderValue, currency),
              icon: TrendingUp,
              sub: stats.fulfillmentRate30d != null ? `${stats.fulfillmentRate30d}% fulfilled` : "—",
            },
            {
              label: "Customers",
              value: stats.customersCount.toLocaleString("en-US"),
              icon: Users,
              sub: `+${stats.newCustomers30d.toLocaleString("en-US")} new in 30 days`,
            },
            {
              label: "Products",
              value: stats.productsCount.toLocaleString("en-US"),
              icon: Package,
              sub:
                stats.lowStockCount > 0
                  ? `${stats.lowStockCount} low-stock variant${stats.lowStockCount === 1 ? "" : "s"}`
                  : "Inventory healthy",
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
            title: page.title || "Untitled page",
            type: "page_id" as const,
            lastEditedLabel: page.lastEditedTime ? formatDate(page.lastEditedTime) : "Unknown date",
          }))
        : [],
    [notionData]
  );

  const notionDatabaseOptions = useMemo<NotionParentOption[]>(
    () =>
      notionData
        ? notionData.databases.map((db) => ({
            id: db.id,
            title: db.title || "Untitled database",
            type: "database_id" as const,
            lastEditedLabel: db.lastEditedTime ? formatDate(db.lastEditedTime) : "Unknown date",
          }))
        : [],
    [notionData]
  );

  async function handleCreateNotionPage() {
    if (!activeNotion?.id || !notionParentId.trim() || !notionTitle.trim()) return;
    setNotionSaving(true);
    setNotionWriteMessage(null);
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/notion/${activeNotion.id}/pages`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: notionParentId.trim(),
          parentType: notionParentType,
          title: notionTitle.trim(),
          content: notionContent.trim(),
          business_profile_id: activeBusinessProfileId ?? activeProfileId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, "Could not create Notion page."));
      }
      setNotionWriteMessage("Page created in Notion.");
      setNotionTitle("");
      setNotionContent("");
      void refresh();
    } catch (err) {
      setNotionWriteMessage(err instanceof Error ? err.message : "Could not create Notion page.");
    } finally {
      setNotionSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={ShoppingCart}
        title="E-commerce"
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
                    <span className="ml-1.5 hidden sm:inline">Open admin</span>
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
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
            </div>
          ) : null
        }
      />

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <SectionConnectionStatus area="ecommerce" />
      </m.div>

      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
            tab === "overview"
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("products")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
            tab === "products"
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Boxes className="h-3.5 w-3.5" />
          Products
          {products.length > 0 ? (
            <span className="ml-0.5 text-xs text-muted-foreground">({products.length})</span>
          ) : null}
        </button>
      </div>

      {tab === "products" && (
        <div className="space-y-8">
          <m.div {...fadeUp} transition={{ duration: 0.35 }}>
            <McpFeatureSection
              businessProfileId={activeBusinessProfileId ?? activeProfileId}
              featureIds={MCP_PAGE_FEATURE_IDS.ecommerce}
              title="Shopify catalog (MCP)"
              description="Query your connected Shopify store via MCP. Requires shop domain at connect time."
            />
          </m.div>
          <m.div {...fadeUp} transition={{ duration: 0.35 }}>
            <AlibabaImportCard
              businessProfileId={activeProfileId}
              shopifyAccountId={shopifyAccount?.id ?? null}
              onSaveAsProduct={handleSaveAsProduct}
            />
          </m.div>
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

      {tab === "overview" && (
      <div className="space-y-8">
      {authMode === "local" && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Local mode is active. OAuth/connect is enabled for local testing and data stays local to your current session.
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
            message={formatOAuthErrorMessage(
              oauthErrorDetails,
              {
                shopify_not_configured: "Shopify is not configured. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to .env.local.",
                shopify_public_url_missing: "Shopify requires a public HTTPS host (e.g. a tunnel). Set SHOPIFY_APP_URL in .env.local before connecting.",
                shopify_public_url_must_be_https: "SHOPIFY_APP_URL must start with https://. Use your tunnel's HTTPS URL.",
                shopify_invalid_shop: "That store URL isn't a valid Shopify shop. Use the format mystore.myshopify.com (3–60 chars, letters/digits/hyphens).",
                notion_not_configured: "Notion is not configured. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET to .env.local.",
                notion_public_url_must_be_https: "Notion requires a public HTTPS host. Set NOTION_APP_URL in .env.local to your tunnel URL.",
                shopify_missing_shop: "No shop domain was provided. Try connecting again.",
                token_exchange_failed: "OAuth token exchange failed. Check client id/secret and redirect URL in the provider console (Notion integration or Shopify app).",
                invalid_state: "OAuth state did not match (session or tunnel cookie issue). Try connecting again from the same browser tab.",
              },
              "Login failed"
            )}
            onDismiss={clearOauthError}
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
            description="Koppla din Shopify-butik för ordrar och lager. Importera produkter från Alibaba ovan."
            action={
              <Button onClick={handleConnect} className="glow-sm">
                <ShopifyIcon className="h-4 w-4 mr-2" />
                Koppla Shopify
              </Button>
            }
          />
          <p className="text-xs text-muted-foreground/60 text-center max-w-lg mx-auto">
            Notion kan kopplas via{" "}
            <a href="/connections" className="underline underline-offset-2 hover:text-foreground">
              Connections
            </a>
            .
          </p>
        </m.div>
      )}

      {/* Fetch error */}
      {error && activeOrgAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
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

      {/* Stats cards */}
      {!loading && statCards && (
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
      {!loading && shopifyData && shopifyData.revenueTrend.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Revenue trend
              </CardTitle>
              <CardDescription>
                Last 30 days · Total {formatCurrencyDetailed(shopifyData.stats.revenue30d, currency)}
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
                        formatter={(value) => formatCurrencyDetailed(Number(value), currency)}
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
      {!loading && shopifyData && (shopifyData.topProducts.length > 0 || shopifyData.topCustomers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shopifyData.topProducts.length > 0 && (
            <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Box className="h-5 w-5" />
                    Top products
                  </CardTitle>
                  <CardDescription>By revenue, last 30 days</CardDescription>
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
                          {product.quantity.toLocaleString("en-US")} sold
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
                    Top customers
                  </CardTitle>
                  <CardDescription>By lifetime spend</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {shopifyData.topCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{customer.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {customer.email || `${customer.ordersCount} orders`}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(customer.totalSpent, customer.currency || currency)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </m.div>
          )}
        </div>
      )}

      {/* Operational alerts: abandoned + low stock */}
      {!loading && shopifyData && (shopifyData.abandonedCheckouts.length > 0 || shopifyData.lowStock.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shopifyData.abandonedCheckouts.length > 0 && (
            <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Receipt className="h-5 w-5 text-orange-500" />
                        Abandoned checkouts
                      </CardTitle>
                      <CardDescription>
                        {shopifyData.stats.abandonedCheckouts30d} carts · {formatCurrencyDetailed(shopifyData.stats.abandonedValue30d, currency)} at risk
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={shopifyData.adminLinks.checkouts} target="_blank" rel="noreferrer" className="text-muted-foreground">
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {shopifyData.abandonedCheckouts.map((checkout) => (
                    <div
                      key={checkout.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{checkout.email || "Anonymous"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(checkout.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(checkout.total, checkout.currency)}
                        </p>
                        {checkout.recoveryUrl && (
                          <a
                            href={checkout.recoveryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="Open recovery link"
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
                        Low stock
                      </CardTitle>
                      <CardDescription>Variants at or below 5 units in stock</CardDescription>
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
                          {[item.variantTitle, item.sku].filter(Boolean).join(" · ") || "Default variant"}
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
                        {item.quantity} left
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
      {!loading && shopifyData && shopifyData.promotions.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="h-5 w-5" />
                    Active promotions
                  </CardTitle>
                  <CardDescription>{shopifyData.stats.activePromotions} price rules currently live</CardDescription>
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
                      {promo.targetType || "order"} · used {promo.usageCount.toLocaleString("en-US")} time{promo.usageCount === 1 ? "" : "s"}
                      {promo.endsAt ? ` · ends ${formatDate(promo.endsAt)}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-green-600">
                    {formatPromoValue(promo.value, promo.valueType)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Recent orders */}
      {!loading && shopifyData && shopifyData.orders.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.45 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShoppingCart className="h-5 w-5" />
                    Recent orders
                  </CardTitle>
                  <CardDescription>
                    {filteredOrders.length} shown · {shopifyData.orders.length} loaded
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={orderPaymentFilter} onValueChange={setOrderPaymentFilter}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All payments</SelectItem>
                      {orderPaymentOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={orderFulfillmentFilter} onValueChange={setOrderFulfillmentFilter}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Fulfillment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All fulfillment</SelectItem>
                      {orderFulfillmentOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportOrders} disabled={filteredOrders.length === 0}>
                    <Download className="h-4 w-4 mr-1.5" />
                    Export CSV
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
                  <p className="text-sm text-muted-foreground text-center py-8">No orders match these filters.</p>
                ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left px-5 py-3 font-medium">Order</th>
                      <th className="text-left px-3 py-3 font-medium">Customer</th>
                      <th className="text-left px-3 py-3 font-medium">Items</th>
                      <th className="text-left px-3 py-3 font-medium">Payment</th>
                      <th className="text-left px-3 py-3 font-medium">Fulfillment</th>
                      <th className="text-right px-5 py-3 font-medium">Total</th>
                      <th className="text-right px-5 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, i) => (
                      <m.tr
                        key={order.id}
                        {...fadeUp}
                        transition={{ duration: 0.3, delay: i * 0.03 }}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium">{order.name}</td>
                        <td className="px-3 py-3 text-muted-foreground truncate max-w-[140px]">
                          {order.customer || order.email || "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{order.lineItemCount}</td>
                        <td className="px-3 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] ?? "bg-muted text-muted-foreground"}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fulfillmentColors[order.fulfillment] ?? "bg-muted text-muted-foreground"}`}>
                            {order.fulfillment || "unfulfilled"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium">
                          {formatCurrency(order.total, order.currency)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                          {formatDate(order.createdAt)}
                        </td>
                      </m.tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Store plan info */}
      {!loading && shopifyData?.shop && (
        <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
          <Card className="bg-card border-border">
            <CardContent className="py-4 px-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span><span className="text-foreground font-medium">Store:</span> {shopifyData.shop.name}</span>
              <span>
                <span className="text-foreground font-medium">Domain:</span>{" "}
                <a href={shopifyData.shop.storefrontUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                  {shopifyData.shop.domain}
                </a>
              </span>
              {shopifyData.shop.plan && <span><span className="text-foreground font-medium">Plan:</span> {shopifyData.shop.plan}</span>}
              {shopifyData.shop.currency && <span><span className="text-foreground font-medium">Currency:</span> {shopifyData.shop.currency}</span>}
              {shopifyData.shop.country && <span><span className="text-foreground font-medium">Country:</span> {shopifyData.shop.country}</span>}
              {shopifyData.shop.timezone && <span><span className="text-foreground font-medium">Timezone:</span> {shopifyData.shop.timezone}</span>}
              {shopifyData.shop.email && <span><span className="text-foreground font-medium">Email:</span> {shopifyData.shop.email}</span>}
            </CardContent>
          </Card>
        </m.div>
      )}

      {!loading && notionData && (
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
                      {notionData.workspace.name || "Connected workspace"} · {notionData.stats.pagesCount} sidor
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notionOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 px-6 pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-muted-foreground">Pages found</p>
                    <p className="text-2xl font-bold">{notionData.stats.pagesCount}</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-muted-foreground">Databases found</p>
                    <p className="text-2xl font-bold">{notionData.stats.databasesCount}</p>
                  </div>
                </div>

                {notionData.pages.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Recent Notion pages
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
                          <p className="font-medium truncate">{page.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {page.lastEditedTime ? formatDate(page.lastEditedTime) : "Unknown date"}
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
                      Create Notion page
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share the parent page/database with your integration first.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-parent-select">Pick parent (optional)</Label>
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
                      <option value="">Select a page or database...</option>
                      {notionPageOptions.length > 0 && (
                        <optgroup label={`Pages (${notionPageOptions.length})`}>
                          {notionPageOptions.map((option) => (
                            <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                              {option.title} - {option.lastEditedLabel}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {notionDatabaseOptions.length > 0 && (
                        <optgroup label={`Databases (${notionDatabaseOptions.length})`}>
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
                    <Label htmlFor="notion-parent-id">Parent ID</Label>
                    <Input
                      id="notion-parent-id"
                      placeholder="page or database id"
                      value={notionParentId}
                      onChange={(e) => setNotionParentId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-parent-type">Parent type</Label>
                    <select
                      id="notion-parent-type"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={notionParentType}
                      onChange={(e) => setNotionParentType(e.target.value === "database_id" ? "database_id" : "page_id")}
                    >
                      <option value="page_id">Page</option>
                      <option value="database_id">Database</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-page-title">Title</Label>
                    <Input
                      id="notion-page-title"
                      placeholder="Weekly planning"
                      value={notionTitle}
                      onChange={(e) => setNotionTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notion-page-content">Content (optional)</Label>
                    <Input
                      id="notion-page-content"
                      placeholder="First paragraph for the page"
                      value={notionContent}
                      onChange={(e) => setNotionContent(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCreateNotionPage}
                      disabled={notionSaving || !notionParentId.trim() || !notionTitle.trim() || !activeNotion}
                    >
                      {notionSaving ? "Creating..." : "Create in Notion"}
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

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShopifyIcon className="h-4 w-4" />
              Connect Shopify
            </DialogTitle>
            <DialogDescription>
              Koppla rätt butik genom att ange butikens permanenta Shopify-domän.
            </DialogDescription>
          </DialogHeader>
          <ShopifyConnectGuide />
          <div className="space-y-2 py-2">
            <Label htmlFor="ecom-shop-domain">Store domain</Label>
            <Input
              id="ecom-shop-domain"
              placeholder={SHOPIFY_DOMAIN_EXAMPLE}
              value={shopDomain}
              onChange={(e) => {
                setShopDomain(e.target.value);
                setShopDomainError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleConnectSubmit()}
              aria-invalid={Boolean(shopDomainError)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Du kan också klistra in en Shopify Admin-länk, t.ex. admin.shopify.com/store/mystore.
            </p>
            {shopDomainError ? <p className="text-xs text-destructive">{shopDomainError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectSubmit} disabled={!shopDomain.trim()}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
