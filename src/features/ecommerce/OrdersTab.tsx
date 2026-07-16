import { m } from "framer-motion";
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  Receipt,
  Box,
  ArrowUpRight,
  ChevronDown,
  Download,
  ExternalLink,
} from "lucide-react";
import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutomationEnableHint } from "@/features/automation";
import { AbandonedCheckoutRecoveryButton } from "@/features/ecommerce/AbandonedCheckoutRecoveryButton";
import { formatCurrency } from "@/lib/format";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import {
  statusColors,
  fulfillmentColors,
  paymentStatusLabel,
  fulfillmentStatusLabel,
} from "@/features/ecommerce/orderDisplay";
import { formatDate, type ShopifyData, type ShopifyOrder } from "@/features/ecommerce/ecommerceOrg";

export type ActionNeeded = {
  staleUnfulfilled: number;
  pendingPayments: number;
  lowStock: number;
  total: number;
};

type Props = {
  shopifyData: ShopifyData;
  actionNeeded: ActionNeeded;
  currency: string;
  staleUnfulfilledDays: number;
  businessProfileId: string | null;
  orderPaymentFilter: string;
  orderFulfillmentFilter: string;
  orderPaymentOptions: string[];
  orderFulfillmentOptions: string[];
  filteredOrders: ShopifyOrder[];
  expandedOrderId: string | null;
  onOrderPaymentFilterChange: (value: string) => void;
  onOrderFulfillmentFilterChange: (value: string) => void;
  onExpandedOrderIdChange: (id: string | null) => void;
  onFilterStaleUnfulfilled: () => void;
  onFilterPendingPayments: () => void;
  onExportOrders: () => void;
};

/** Orders action strip, operational alerts, and orders table for the ecommerce Ordrar tab. */
export function OrdersTab({
  shopifyData,
  actionNeeded,
  currency,
  staleUnfulfilledDays,
  businessProfileId,
  orderPaymentFilter,
  orderFulfillmentFilter,
  orderPaymentOptions,
  orderFulfillmentOptions,
  filteredOrders,
  expandedOrderId,
  onOrderPaymentFilterChange,
  onOrderFulfillmentFilterChange,
  onExpandedOrderIdChange,
  onFilterStaleUnfulfilled,
  onFilterPendingPayments,
  onExportOrders,
}: Props) {
  return (
    <>
      {/* Action needed strip */}
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
                  onClick={onFilterStaleUnfulfilled}
                  className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  <Package className="h-3 w-3" aria-hidden />
                  {actionNeeded.staleUnfulfilled} ej skickade &gt;{staleUnfulfilledDays} dagar
                </button>
              )}
              {actionNeeded.pendingPayments > 0 && (
                <button
                  type="button"
                  onClick={onFilterPendingPayments}
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

      {/* Operational alerts: abandoned + low stock */}
      {(shopifyData.abandonedCheckouts.length > 0 || shopifyData.lowStock.length > 0) && (
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
                          businessProfileId={businessProfileId}
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

      {shopifyData.orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga ordrar hämtade ännu. Uppdatera eller kontrollera Shopify-kopplingen.</p>
      ) : null}

      {/* Recent orders */}
      {shopifyData.orders.length > 0 && (
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
                  <Select value={orderPaymentFilter} onValueChange={onOrderPaymentFilterChange}>
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
                  <Select value={orderFulfillmentFilter} onValueChange={onOrderFulfillmentFilterChange}>
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
                  <Button variant="outline" size="sm" onClick={onExportOrders} disabled={filteredOrders.length === 0}>
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
                            onClick={() => onExpandedOrderIdChange(isExpanded ? null : orderId)}
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
    </>
  );
}
