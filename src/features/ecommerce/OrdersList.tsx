import { m } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/format";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import {
  statusColors,
  fulfillmentColors,
  paymentStatusLabel,
  fulfillmentStatusLabel,
} from "@/features/ecommerce/orderDisplay";
import { formatDate, type ShopifyOrder } from "@/features/ecommerce/ecommerceOrg";

type Props = {
  orders: ShopifyOrder[];
  expandedOrderId: string | null;
  onExpandedOrderIdChange: (id: string | null) => void;
};

/** Expanded line items for one order — shared by the card and table layouts. */
function OrderLineItems({ order }: { order: ShopifyOrder }) {
  const { t } = useTranslation("ecommerce");
  const lineItems = order.lineItems ?? [];

  if (lineItems.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("orders.table.missingLineItems")}</p>;
  }

  return (
    <div className="space-y-1.5">
      {lineItems.map((item, itemIndex) => (
        <div
          key={item.id ?? `${order.id}-item-${itemIndex}`}
          className="flex items-center justify-between gap-3 text-xs"
        >
          <span className="min-w-0 truncate text-foreground">
            {item.title}
            {item.variantTitle ? <span className="text-muted-foreground"> · {item.variantTitle}</span> : null}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {item.quantity} × {formatCurrency(item.price, order.currency, { detailed: true })}
          </span>
        </div>
      ))}
      {order.lineItemCount > lineItems.length ? (
        <p className="text-[11px] text-muted-foreground/70">
          {t("orders.table.moreLines", { count: order.lineItemCount - lineItems.length })}
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className ?? "bg-muted text-muted-foreground"}`}>
      {children}
    </span>
  );
}

/**
 * Recent orders, in two layouts sharing one data shape:
 *
 * - **Phones** get tappable cards. A seven-column table forces either
 *   sideways scrolling or unreadable type at 390px, so the same fields are
 *   restacked: order + total on the headline row, customer underneath,
 *   status pills and date on a footer row.
 * - **`md` and up** keep the scannable table.
 *
 * Both share the expanded/collapsed state, so switching orientation mid-use
 * keeps the open order open.
 */
export function OrdersList({ orders, expandedOrderId, onExpandedOrderIdChange }: Props) {
  const { t } = useTranslation("ecommerce");

  return (
    <>
      {/* Phones: card list */}
      <ul className="divide-y divide-border/50 md:hidden">
        {orders.map((order, i) => {
          const orderId = String(order.id);
          const isExpanded = expandedOrderId === orderId;
          return (
            <m.li key={order.id} {...fadeUp} transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}>
              <button
                type="button"
                onClick={() => onExpandedOrderIdChange(isExpanded ? null : orderId)}
                className="pressable flex w-full flex-col gap-1.5 px-4 py-3 text-left"
                aria-expanded={isExpanded}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                      aria-hidden
                    />
                    <span className="truncate">{order.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(order.total, order.currency)}
                  </span>
                </div>
                <p className="truncate pl-5 text-xs text-muted-foreground">
                  {order.customer || order.email || "—"}
                  {order.lineItemCount > 0
                    ? ` · ${t("orders.table.lines")}: ${order.lineItemCount}`
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pl-5">
                  <StatusPill className={statusColors[order.status]}>
                    {paymentStatusLabel(order.status)}
                  </StatusPill>
                  <StatusPill className={fulfillmentColors[order.fulfillment]}>
                    {fulfillmentStatusLabel(order.fulfillment || "unfulfilled")}
                  </StatusPill>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </span>
                </div>
              </button>
              {isExpanded ? (
                <div className="bg-muted/20 px-4 pb-3 pt-1">
                  <OrderLineItems order={order} />
                </div>
              ) : null}
            </m.li>
          );
        })}
      </ul>

      {/* md+: table */}
      <div className="data-scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-5 py-3 text-left font-medium">{t("orders.table.order")}</th>
              <th className="px-3 py-3 text-left font-medium">{t("orders.table.customer")}</th>
              <th className="px-3 py-3 text-left font-medium">{t("orders.table.lines")}</th>
              <th className="px-3 py-3 text-left font-medium">{t("orders.table.payment")}</th>
              <th className="px-3 py-3 text-left font-medium">{t("orders.table.fulfillment")}</th>
              <th className="px-5 py-3 text-right font-medium">{t("orders.table.total")}</th>
              <th className="px-5 py-3 text-right font-medium">{t("orders.table.date")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => {
              const orderId = String(order.id);
              const isExpanded = expandedOrderId === orderId;
              return (
                <Fragment key={order.id}>
                  <m.tr
                    {...fadeUp}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                    onClick={() => onExpandedOrderIdChange(isExpanded ? null : orderId)}
                    className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30"
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
                    <td className="max-w-[140px] truncate px-3 py-3 text-muted-foreground">
                      {order.customer || order.email || "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{order.lineItemCount}</td>
                    <td className="px-3 py-3">
                      <StatusPill className={statusColors[order.status]}>
                        {paymentStatusLabel(order.status)}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill className={fulfillmentColors[order.fulfillment]}>
                        {fulfillmentStatusLabel(order.fulfillment || "unfulfilled")}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      {formatCurrency(order.total, order.currency)}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </td>
                  </m.tr>
                  {isExpanded ? (
                    <tr className="border-b border-border/50 bg-muted/20 last:border-0">
                      <td colSpan={7} className="px-5 py-3">
                        <OrderLineItems order={order} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
