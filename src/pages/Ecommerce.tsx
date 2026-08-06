import { m } from "framer-motion";
import { useTranslation } from "react-i18next";
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
import { ValueSellEmpty } from "@/components/ValueSellEmpty";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { AlibabaImportCard } from "@/features/ecommerce/AlibabaImportCard";
import { ProductsTab } from "@/features/ecommerce/ProductsTab";
import { OrdersTab } from "@/features/ecommerce/OrdersTab";
import { InsightsTab } from "@/features/ecommerce/InsightsTab";
import { OverviewTab } from "@/features/ecommerce/OverviewTab";
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
  const { t: tPage } = useTranslation("pages");
  const { t } = useTranslation("ecommerce");
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
        throw new Error(apiErrorMessage(d, t("errors.fetchStoreData")));
      }
      return res.json();
    },
  });
  const [searchParams, setSearchParams] = useSearchParams();
  type EcommerceTab = "overview" | "orders" | "products" | "insights" | "tools";
  const ECOMMERCE_TABS: EcommerceTab[] = ["overview", "orders", "products", "insights", "tools"];
  const rawEcommerceTab = searchParams.get("tab");
  const tab: EcommerceTab =
    rawEcommerceTab && (ECOMMERCE_TABS as string[]).includes(rawEcommerceTab)
      ? (rawEcommerceTab as EcommerceTab)
      : "overview";

  const setTab = useCallback(
    (next: EcommerceTab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === "overview") params.delete("tab");
          else params.set("tab", next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

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
        if (!ignore) setProductsError(e instanceof Error ? e.message : t("errors.loadProducts"));
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
      if (!productProfileId) throw new Error(t("errors.noActiveProfile"));
      const product = await createProduct(productProfileId, input);
      setProducts((prev) => [product, ...prev]);
      return product;
    },
    [productProfileId]
  );

  const handleUpdateProduct = useCallback(
    async (id: string, patch: Partial<ProductInput>) => {
      if (!productProfileId) throw new Error(t("errors.noActiveProfile"));
      const product = await updateProduct(productProfileId, id, patch);
      setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
    },
    [productProfileId]
  );

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      if (!productProfileId) throw new Error(t("errors.noActiveProfile"));
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
        t("toasts.shopifySync", { imported: result.imported, updated: result.updated })
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.importShopify"));
    } finally {
      setImportingShopify(false);
    }
  }, [productProfileId, shopifyAccount?.id]);

  const handleSaveAsProduct = useCallback(
    async (imported: AlibabaProductImport) => {
      await handleCreateProduct(alibabaImportToInput(imported));
      setTab("products");
    },
    [handleCreateProduct, setTab]
  );

  const currency = shopifyData?.stats.currency || "USD";

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={ShoppingCart}
        title={tPage("ecommerce.title")}
        description={
          shopifyData?.shop.name
            ? `${shopifyData.shop.name} · ${shopifyData.shop.domain}`
            : notionData?.workspace?.name
              ? `${notionData.workspace.name} · ${t("workspaceSuffix")}`
              : tPage("ecommerce.descriptionEmpty")
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
                    <span className="ml-1.5 hidden sm:inline">{t("headerActions.openAdmin")}</span>
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
                <span className="ml-1.5 hidden sm:inline">{t("headerActions.refresh")}</span>
              </Button>
            </div>
          ) : null
        }
      />

      <PageSmartBar
        title={tPage("ecommerce.smartBar")}
        steps={[tPage("ecommerce.step1"), tPage("ecommerce.step2"), tPage("ecommerce.step3")]}
        tip={tPage("ecommerce.tip")}
        liveHintOverride={
          actionNeeded && actionNeeded.total > 0
            ? tPage("ecommerce.liveActions", { count: actionNeeded.total })
            : shopifyData
              ? tPage("ecommerce.liveOk")
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
            aria-label={t("tabs.ariaLabel")}
            onChange={setTab}
            options={[
              { value: "overview", label: t("tabs.overview") },
              { value: "orders", label: t("tabs.orders"), count: shopifyData?.orders.length },
              { value: "products", label: t("tabs.products"), count: products.length },
              { value: "insights", label: t("tabs.insights") },
              { value: "tools", label: t("tabs.tools") },
            ]}
          />
        </div>

        {(tab === "overview" || tab === "orders" || tab === "insights") ? (
        <div className="app-workspace-stats grid grid-cols-3 gap-2 px-3 py-2 sm:px-4">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("statsStrip.products")}</p>
            <p className="text-xs font-semibold tabular-nums">{products.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("statsStrip.orders")}</p>
            <p className="text-xs font-semibold tabular-nums">{shopifyData?.orders.length ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("statsStrip.actions")}</p>
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

      {(tab === "overview" || tab === "orders" || tab === "insights" || tab === "tools") && (
      <div className="space-y-8">
      {authMode === "local" && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                {t("localMode.message")}
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
              {acc.username} · {acc.platform === "shopify" ? t("platforms.shopify") : t("platforms.notion")}
            </button>
          ))}
        </m.div>
      )}

      {orgAccounts.length === 0 && tab !== "overview" && (
        <m.div
          {...fadeUp}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-3"
        >
          <ValueSellEmpty
            icon={ShoppingBag}
            title={t("valueSell.title")}
            description={
              tab === "tools"
                ? t("valueSell.description.tools")
                : tab === "insights"
                  ? t("valueSell.description.insights")
                  : t("valueSell.description.default")
            }
            trust={t("valueSell.trust")}
            primary={{ label: t("valueSell.primary"), to: "/connections?wizard=1&session=shopify" }}
            secondary={{ label: t("valueSell.secondary"), to: "/connections?session=shopify" }}
          />
        </m.div>
      )}

      {/* Fetch error */}
      {error && activeOrgAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>{t("common:common.close")}</Button>
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

      {tab === "overview" && !loading && (
        <OverviewTab
          shopifyData={shopifyData}
          products={products}
          currency={currency}
          businessProfileId={productProfileId}
          actionNeeded={actionNeeded}
          onOpenTab={(next) => setTab(next)}
          onCreateLead={createLead}
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
              title={t("mcp.title")}
              description={t("mcp.description")}
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
              <span><span className="text-foreground font-medium">{t("shopInfo.store")}</span> {shopifyData.shop.name}</span>
              <span>
                <span className="text-foreground font-medium">{t("shopInfo.domain")}</span>{" "}
                <a href={shopifyData.shop.storefrontUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                  {shopifyData.shop.domain}
                </a>
              </span>
              {shopifyData.shop.plan && <span><span className="text-foreground font-medium">{t("shopInfo.plan")}</span> {shopifyData.shop.plan}</span>}
              {shopifyData.shop.currency && <span><span className="text-foreground font-medium">{t("shopInfo.currency")}</span> {shopifyData.shop.currency}</span>}
              {shopifyData.shop.country && <span><span className="text-foreground font-medium">{t("shopInfo.country")}</span> {shopifyData.shop.country}</span>}
              {shopifyData.shop.timezone && <span><span className="text-foreground font-medium">{t("shopInfo.timezone")}</span> {shopifyData.shop.timezone}</span>}
              {shopifyData.shop.email && <span><span className="text-foreground font-medium">{t("shopInfo.email")}</span> {shopifyData.shop.email}</span>}
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
