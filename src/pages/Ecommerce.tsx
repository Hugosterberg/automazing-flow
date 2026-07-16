import { m } from "framer-motion";
import {
  ShoppingCart,
  RefreshCw,
  Loader2,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ValueSellEmpty } from "@/components/ValueSellEmpty";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { ShopifyIcon } from "@/components/platform-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { AlibabaImportCard } from "@/features/ecommerce/AlibabaImportCard";
import { ProductsTab } from "@/features/ecommerce/ProductsTab";
import { OrdersTab } from "@/features/ecommerce/OrdersTab";
import { InsightsTab } from "@/features/ecommerce/InsightsTab";
import { NotionWorkspacePanel } from "@/features/ecommerce/NotionWorkspacePanel";
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
import { accountDataUrl } from "@/lib/accountDataUrl";
import { downloadCsv, shopifyOrdersToCsv } from "@/lib/exportCsv";
import {
  orderFiltersStorageKey,
  readPersistedOrderFilters,
} from "@/features/ecommerce/orderDisplay";
import {
  sortOrgAccounts,
  isShopifyData,
  isNotionData,
  type OrganizationData,
} from "@/features/ecommerce/ecommerceOrg";

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

  const currency = shopifyData?.stats.currency || "USD";

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
          <ValueSellEmpty
            icon={ShoppingBag}
            title="Ordrar, lager och kundvagn — i samma arbetsyta"
            description={
              tab === "tools"
                ? "Koppla Shopify för ordrar och lager. Importera från Alibaba eller använd Notion under Verktyg."
                : tab === "insights"
                  ? "Se intäkter, topsäljare och kampanjdata när butiken är kopplad — utan att hoppa till admin."
                  : "Koppla Shopify så dyker ordrar och lager upp här. Kundvagnsåtervinning körs som utkast du godkänner."
            }
            trust="Automationer skickar inte utan dig — draft-before-send för känsliga flöden."
            primary={{ label: "Koppla Shopify", to: "/connections?wizard=1&q=shopify" }}
            secondary={{ label: "Öppna Kopplingar", to: "/connections?q=shopify" }}
          />
          <EmptyState
            icon={ShoppingBag}
            title="Shopify är hemmet för e-handel här"
            description="Kopplingar är den enda platsen för integrationer. Notion kopplas också där."
            size="compact"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/connections?q=shopify">
                  <ShopifyIcon className="h-4 w-4 mr-2" />
                  Till Kopplingar
                </Link>
              </Button>
            }
          />
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

      {tab === "orders" && !loading && shopifyData && actionNeeded && (
        <OrdersTab
          shopifyData={shopifyData}
          actionNeeded={actionNeeded}
          currency={currency}
          staleUnfulfilledDays={STALE_UNFULFILLED_DAYS}
          businessProfileId={productProfileId}
          orderPaymentFilter={orderPaymentFilter}
          orderFulfillmentFilter={orderFulfillmentFilter}
          orderPaymentOptions={orderPaymentOptions}
          orderFulfillmentOptions={orderFulfillmentOptions}
          filteredOrders={filteredOrders}
          expandedOrderId={expandedOrderId}
          onOrderPaymentFilterChange={setOrderPaymentFilter}
          onOrderFulfillmentFilterChange={setOrderFulfillmentFilter}
          onExpandedOrderIdChange={setExpandedOrderId}
          onFilterStaleUnfulfilled={() => {
            setTab("orders");
            setOrderPaymentFilter("all");
            setOrderFulfillmentFilter("unfulfilled");
          }}
          onFilterPendingPayments={() => {
            setTab("orders");
            setOrderPaymentFilter("pending");
            setOrderFulfillmentFilter("all");
          }}
          onExportOrders={exportOrders}
        />
      )}

      {tab === "insights" && !loading && shopifyData && (
        <InsightsTab
          shopifyData={shopifyData}
          currency={currency}
          onCreateLead={createLead}
        />
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
        <NotionWorkspacePanel
          notionData={notionData}
          activeNotionId={activeNotion?.id ?? null}
          businessProfileId={activeBusinessProfileId ?? activeProfileId}
          onRefresh={handleRefresh}
        />
      )}
      </div>
      )}

        </div>
      </div>

    </div>
  );
}
