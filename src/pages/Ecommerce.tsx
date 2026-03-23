import { motion } from "framer-motion";
import {
  ShoppingCart,
  Package,
  BarChart3,
  RefreshCw,
  Loader2,
  TrendingUp,
  DollarSign,
  ShoppingBag,
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
import { ShopifyIcon } from "@/components/platform-icons";
import { useState, useEffect, useRef, useCallback } from "react";

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
  const { oauthError, clearOauthError } = useOAuthCallback();
  const { accounts, selectedAccountId, setSelectedAccountId, activeProfileId } = useAccounts();

  const shopifyAccounts = accounts.filter((a) => a.platform === "shopify" && a.isOAuth);
  const activeShopify =
    shopifyAccounts.find((a) => a.id === selectedAccountId) ?? shopifyAccounts[0] ?? null;

  const [data, setData] = useState<ShopifyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");

  const fetchData = useCallback(async (accountId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${accountId}/data`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not fetch store data.");
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error – make sure the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeShopify) { setData(null); return; }
    if (fetchedFor.current === activeShopify.id) return;
    fetchedFor.current = activeShopify.id;
    fetchData(activeShopify.id);
  }, [activeShopify, fetchData]);

  useEffect(() => {
    if (shopifyAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(shopifyAccounts[0].id);
    }
  }, [shopifyAccounts.length]);

  function handleConnect() {
    setShopDomain("");
    setConnectDialogOpen(true);
  }

  function handleConnectSubmit() {
    const shop = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop) return;
    const params = new URLSearchParams({ shop });
    if (activeProfileId) params.set("profile_id", activeProfileId);
    setConnectDialogOpen(false);
    setShopDomain("");
    window.location.href = `${API_BASE}/api/auth/shopify?${params}`;
  }

  function handleRefresh() {
    if (!activeShopify) return;
    fetchedFor.current = null;
    fetchData(activeShopify.id);
  }

  const stats = data?.stats;
  const currency = stats?.currency || "USD";

  const statCards = stats
    ? [
        { label: "Revenue (30 days)", value: formatCurrency(stats.revenue30d, currency), icon: DollarSign, sub: `${stats.ordersCount} total orders` },
        { label: "Orders fetched", value: String(data?.orders.length ?? 0), icon: ShoppingCart, sub: `${stats.ordersCount} total in store` },
        { label: "Products", value: stats.productsCount.toLocaleString("en-US"), icon: Package, sub: "active listings" },
        { label: "Avg. order value", value: formatCurrency(stats.avgOrderValue, currency), icon: TrendingUp, sub: "from recent orders" },
      ]
    : null;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">E-commerce</h1>
            <p className="text-muted-foreground mt-1">
              {data?.shop.name
                ? `${data.shop.name} · ${data.shop.domain}`
                : "Connect your Shopify store to get started"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeShopify && (
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="text-muted-foreground">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* OAuth error */}
      {oauthError && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">
                {oauthError === "shopify_not_configured"
                  ? "Shopify is not configured. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to .env."
                  : oauthError === "shopify_missing_shop"
                    ? "No shop domain was provided. Try connecting again."
                    : `Login failed: ${oauthError.replace(/_/g, " ")}`}
              </p>
              <Button variant="ghost" size="sm" onClick={clearOauthError}>Dismiss</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Account switcher (multiple stores) */}
      {shopifyAccounts.length > 1 && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
          {shopifyAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => { setSelectedAccountId(acc.id); fetchedFor.current = null; }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeShopify?.id === acc.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {acc.username}
            </button>
          ))}
        </motion.div>
      )}

      {/* Not connected */}
      {shopifyAccounts.length === 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-lg">Connect your Shopify store</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  View orders, revenue and product stats directly in the app.
                </p>
              </div>
              <Button onClick={handleConnect} className="glow-sm">
                <ShopifyIcon className="h-4 w-4 mr-2" />
                Connect Shopify
              </Button>
              <p className="text-xs text-muted-foreground/60">
                Requires <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">SHOPIFY_API_KEY</code> and{" "}
                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">SHOPIFY_API_SECRET</code> in .env
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Fetch error */}
      {error && activeShopify && (
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
            <motion.div key={card.label} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.07 }}>
              <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <card.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{card.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      {!loading && data && data.orders.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5" />
                Recent orders
              </CardTitle>
              <CardDescription>Latest {data.orders.length} orders from your store</CardDescription>
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
                    {data.orders.map((order, i) => (
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
      {!loading && data?.shop && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border">
            <CardContent className="py-4 px-5 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span><span className="text-foreground font-medium">Store:</span> {data.shop.name}</span>
              <span><span className="text-foreground font-medium">Domain:</span> {data.shop.domain}</span>
              {data.shop.plan && <span><span className="text-foreground font-medium">Plan:</span> {data.shop.plan}</span>}
              {data.shop.currency && <span><span className="text-foreground font-medium">Currency:</span> {data.shop.currency}</span>}
              {data.shop.email && <span><span className="text-foreground font-medium">Email:</span> {data.shop.email}</span>}
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
