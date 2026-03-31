import { motion } from "framer-motion";
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
} from "lucide-react";
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
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { NotionIcon, ShopifyIcon } from "@/components/platform-icons";
import { useEffect, useMemo, useState } from "react";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { getOAuthProfileId } from "@/lib/oauthProfile";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "";

interface ShopifyStats {
  ordersCount: number;
  productsCount: number;
  revenue30d: number;
  avgOrderValue: number;
  currency: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  total: number;
  currency: string;
  status: string;
  fulfillment: string;
  createdAt: string;
  lineItemCount: number;
}

interface ShopifyData {
  shop: { name: string; domain: string; currency: string; plan: string; email: string };
  stats: ShopifyStats;
  orders: ShopifyOrder[];
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

function formatDate(iso: string) {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
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

const fadeUp = { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };

export default function Ecommerce() {
  const { authMode } = useAuth();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, getSelectedAccountId, setSelectedAccountId, activeProfileId } = useAccounts();
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
    fetcher: async (accountId) => {
      const res = await fetch(`${API_BASE}/api/accounts/${accountId}/data`, { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not fetch store data.");
      }
      return res.json();
    },
  });
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [notionParentId, setNotionParentId] = useState("");
  const [notionParentType, setNotionParentType] = useState<"page_id" | "database_id">("page_id");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionContent, setNotionContent] = useState("");
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionWriteMessage, setNotionWriteMessage] = useState<string | null>(null);

  function handleConnect() {
    setShopDomain("");
    setConnectDialogOpen(true);
  }

  function handleConnectSubmit() {
    const shop = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop) return;
    const params = new URLSearchParams({ shop });
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    setConnectDialogOpen(false);
    setShopDomain("");
    window.location.href = `${API_BASE}/api/auth/shopify?${params}`;
  }

  function handleConnectNotion() {
    const params = new URLSearchParams();
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `${API_BASE}/api/auth/notion${query}`;
  }

  function handleRefresh() {
    void refresh();
  }

  const activeShopify = activeOrgAccount?.platform === "shopify" ? activeOrgAccount : null;
  const activeNotion = activeOrgAccount?.platform === "notion" ? activeOrgAccount : null;
  const shopifyData = isShopifyData(data) ? data : null;
  const notionData = isNotionData(data) ? data : null;

  const stats = shopifyData?.stats;
  const currency = stats?.currency || "USD";
  const statCards = useMemo(
    () =>
      stats && shopifyData
        ? [
            { label: "Revenue (30 days)", value: formatCurrency(stats.revenue30d, currency), icon: DollarSign, sub: `${stats.ordersCount} total orders` },
            { label: "Orders fetched", value: String(shopifyData.orders.length ?? 0), icon: ShoppingCart, sub: `${stats.ordersCount} total in store` },
            { label: "Products", value: stats.productsCount.toLocaleString("en-US"), icon: Package, sub: "active listings" },
            { label: "Avg. order value", value: formatCurrency(stats.avgOrderValue, currency), icon: TrendingUp, sub: "from recent orders" },
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
      const res = await fetch(`${API_BASE}/api/notion/${activeNotion.id}/pages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: notionParentId.trim(),
          parentType: notionParentType,
          title: notionTitle.trim(),
          content: notionContent.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Could not create Notion page.");
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

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-ecom-stat-card]"));
    if (cards.length === 0) return;
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-change',hypothesisId:'A3',location:'Ecommerce:stat-cards',message:'Ecommerce stat card heights after equal-size layout',data:{count:cards.length,heights:cards.map((c)=>c.offsetHeight),labels:cards.map((c)=>c.getAttribute('data-stat-label'))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [statCards]);

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Organization & Management</h1>
            <p className="text-muted-foreground mt-1">
              {shopifyData?.shop.name
                ? `${shopifyData.shop.name} · ${shopifyData.shop.domain}`
                : notionData?.workspace?.name
                  ? `${notionData.workspace.name} · Notion workspace`
                  : "Connect Shopify or Notion to get started"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeOrgAccount && (
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="text-muted-foreground">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {authMode === "local" && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/30 border-border">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Local mode is active. OAuth/connect is enabled for local testing and data stays local to your current session.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* OAuth error */}
      {oauthErrorDetails && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(
              oauthErrorDetails,
              {
                shopify_not_configured: "Shopify is not configured. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to .env.",
                shopify_public_url_must_be_https: "Shopify requires a public HTTPS host. Set SHOPIFY_APP_URL in .env to your tunnel URL.",
                notion_not_configured: "Notion is not configured. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET to .env.",
                notion_public_url_must_be_https: "Notion requires a public HTTPS host. Set NOTION_APP_URL in .env to your tunnel URL.",
                shopify_missing_shop: "No shop domain was provided. Try connecting again.",
              },
              "Login failed"
            )}
            onDismiss={clearOauthError}
          />
        </motion.div>
      )}

      {/* Account switcher */}
      {orgAccounts.length > 1 && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
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
        </motion.div>
      )}

      {/* Not connected */}
      {orgAccounts.length === 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-lg">Connect Shopify or Notion</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Manage commerce data in Shopify and workspace content in Notion.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={handleConnect} className="glow-sm">
                  <ShopifyIcon className="h-4 w-4 mr-2" />
                  Connect Shopify
                </Button>
                <Button onClick={handleConnectNotion} variant="outline">
                  <NotionIcon className="h-4 w-4 mr-2" />
                  Connect Notion
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Requires <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">SHOPIFY_API_KEY</code> and{" "}
                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">SHOPIFY_API_SECRET</code> in .env. For local tunnel OAuth, also set{" "}
                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">SHOPIFY_APP_URL</code>. Notion requires{" "}
                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">NOTION_CLIENT_ID</code> and{" "}
                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">NOTION_CLIENT_SECRET</code>.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Fetch error */}
      {error && activeOrgAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
            </CardContent>
          </Card>
        </motion.div>
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
            <motion.div key={card.label} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.07 }} className="h-full">
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
            </motion.div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      {!loading && shopifyData && shopifyData.orders.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5" />
                Recent orders
              </CardTitle>
              <CardDescription>Latest {shopifyData.orders.length} orders from your store</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                    {shopifyData.orders.map((order, i) => (
                      <motion.tr
                        key={order.id}
                        {...fadeUp}
                        transition={{ duration: 0.3, delay: i * 0.03 }}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium">{order.name}</td>
                        <td className="px-3 py-3 text-muted-foreground truncate max-w-[140px]">
                          {order.email || "—"}
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
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Store plan info */}
      {!loading && shopifyData?.shop && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border">
            <CardContent className="py-4 px-5 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span><span className="text-foreground font-medium">Store:</span> {shopifyData.shop.name}</span>
              <span><span className="text-foreground font-medium">Domain:</span> {shopifyData.shop.domain}</span>
              {shopifyData.shop.plan && <span><span className="text-foreground font-medium">Plan:</span> {shopifyData.shop.plan}</span>}
              {shopifyData.shop.currency && <span><span className="text-foreground font-medium">Currency:</span> {shopifyData.shop.currency}</span>}
              {shopifyData.shop.email && <span><span className="text-foreground font-medium">Email:</span> {shopifyData.shop.email}</span>}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Notion workspace */}
      {!loading && notionData && (
        <motion.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <NotionIcon className="h-5 w-5" />
                Notion Workspace
              </CardTitle>
              <CardDescription>
                {notionData.workspace.name || "Connected workspace"} · Read and write access enabled
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border border-border p-4">
                <p className="text-muted-foreground">Pages found</p>
                <p className="text-2xl font-bold">{notionData.stats.pagesCount}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-muted-foreground">Databases found</p>
                <p className="text-2xl font-bold">{notionData.stats.databasesCount}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!loading && notionData && notionData.pages.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Recent Notion Pages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
                    <p className="text-xs text-muted-foreground truncate">{page.lastEditedTime ? formatDate(page.lastEditedTime) : "Unknown date"}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </a>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!loading && notionData && (
        <motion.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Create Notion Page
              </CardTitle>
              <CardDescription>
                Share the parent page/database with your integration first, then create content directly from this app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="notion-parent-select">Pick parent (optional)</Label>
                <select
                  id="notion-parent-select"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={
                    notionParentId
                      ? `${notionParentType}:${notionParentId}`
                      : ""
                  }
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
                {notionWriteMessage && (
                  <p className="text-xs text-muted-foreground">{notionWriteMessage}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShopifyIcon className="h-4 w-4" />
              Connect Shopify
            </DialogTitle>
            <DialogDescription>
              Enter your Shopify store domain to get started.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ecom-shop-domain">Store domain</Label>
            <Input
              id="ecom-shop-domain"
              placeholder="mystore.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnectSubmit()}
              autoFocus
            />
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
