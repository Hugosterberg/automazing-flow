export type ShopifyOrderInput = {
  created_at?: string;
  total_price?: string | number;
  subtotal_price?: string | number;
  total_discounts?: string | number;
  line_items?: ShopifyLineItem[];
  currency?: string;
};

export type ShopifyLineItem = {
  id?: string | number;
  title?: string;
  product_id?: string | number;
  variant_id?: string | number;
  variant_title?: string;
  quantity?: number | string;
  price?: string | number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function calculateShopifyRevenueStats(orders: unknown) {
  const list = Array.isArray(orders) ? (orders as ShopifyOrderInput[]) : [];
  const now = Date.now();
  const days30Ms = 30 * 86400 * 1000;

  const recent = list.filter((o) => {
    const created = new Date(o.created_at ?? "");
    return now - created.getTime() < days30Ms;
  });

  const revenue30d = recent.reduce((sum, o) => sum + toNumber(o.total_price), 0);
  const avgOrderValue = list.length > 0 ? list.reduce((sum, o) => sum + toNumber(o.total_price), 0) / list.length : 0;

  return {
    revenue30d: Math.round(revenue30d * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
  };
}

/**
 * Buckets order revenue into daily totals for the last `days` days (oldest first).
 * Each bucket carries an ISO date (YYYY-MM-DD) and the aggregated revenue.
 * Days without orders are included as zero so charts render a continuous trend.
 */
export function buildShopifyDailyRevenue(orders: unknown, days = 30) {
  const list = Array.isArray(orders) ? (orders as ShopifyOrderInput[]) : [];
  const buckets = new Map<string, { revenue: number; orders: number }>();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    buckets.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
  }

  for (const order of list) {
    if (!order.created_at) continue;
    const day = order.created_at.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    bucket.revenue += toNumber(order.total_price);
    bucket.orders += 1;
  }

  return Array.from(buckets.entries()).map(([date, value]) => ({
    date,
    revenue: Math.round(value.revenue * 100) / 100,
    orders: value.orders,
  }));
}

/**
 * Aggregates the top N products from order line items, ranked by revenue.
 * Line item price * quantity is used because Shopify orders carry the prices
 * actually paid (including line-level discounts already applied).
 */
export function topShopifyProducts(orders: unknown, limit = 5) {
  const list = Array.isArray(orders) ? (orders as ShopifyOrderInput[]) : [];
  const agg = new Map<string, { productId: string | number | null; title: string; quantity: number; revenue: number }>();

  for (const order of list) {
    for (const item of order.line_items || []) {
      const key = String(item.product_id ?? item.title ?? item.id ?? "unknown");
      const quantity = toNumber(item.quantity);
      const revenue = quantity * toNumber(item.price);
      const existing = agg.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.revenue += revenue;
      } else {
        agg.set(key, {
          productId: item.product_id ?? null,
          title: item.title || "Untitled product",
          quantity,
          revenue,
        });
      }
    }
  }

  return Array.from(agg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((p) => ({
      productId: p.productId,
      title: p.title,
      quantity: p.quantity,
      revenue: Math.round(p.revenue * 100) / 100,
    }));
}
