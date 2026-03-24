import { calculateShopifyRevenueStats } from "../analytics/shopifyMetrics.ts";

type ShopifyOrder = {
  id: string | number;
  name?: string;
  email?: string;
  total_price?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string;
  created_at?: string;
  line_items?: unknown[];
};

export async function fetchShopifyAccountData(accessToken: string, shop: string | undefined) {
  if (!shop) {
    return { error: "No shop domain stored for this account", status: 400 };
  }

  const shopHeaders = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  const apiBase = `https://${shop}/admin/api/2024-01`;

  const [shopRes, ordersRes, productsCountRes, ordersCountRes] = await Promise.all([
    fetch(`${apiBase}/shop.json`, { headers: shopHeaders }),
    fetch(`${apiBase}/orders.json?status=any&limit=10&order=created_at+desc`, { headers: shopHeaders }),
    fetch(`${apiBase}/products/count.json`, { headers: shopHeaders }),
    fetch(`${apiBase}/orders/count.json?status=any`, { headers: shopHeaders }),
  ]);

  if (!shopRes.ok) {
    return { error: "Could not fetch Shopify store data", status: 502 };
  }

  const [shopData, ordersData, productsCountData, ordersCountData] = await Promise.all([
    shopRes.json(),
    ordersRes.ok ? ordersRes.json() : { orders: [] },
    productsCountRes.ok ? productsCountRes.json() : { count: 0 },
    ordersCountRes.ok ? ordersCountRes.json() : { count: 0 },
  ]);

  const shopInfo = (shopData as { shop?: Record<string, string> }).shop || {};
  const orders = ((ordersData as { orders?: ShopifyOrder[] }).orders || []) as ShopifyOrder[];
  const revenueStats = calculateShopifyRevenueStats(orders);

  const formattedOrders = orders.map((o) => ({
    id: o.id,
    name: o.name,
    email: o.email || "",
    total: parseFloat(o.total_price || "0"),
    currency: o.currency || shopInfo.currency || "USD",
    status: o.financial_status || "pending",
    fulfillment: o.fulfillment_status || "unfulfilled",
    createdAt: o.created_at,
    lineItemCount: (o.line_items || []).length,
  }));

  return {
    shop: {
      name: shopInfo.name,
      domain: shopInfo.domain || shop,
      currency: shopInfo.currency,
      plan: shopInfo.plan_display_name || shopInfo.plan_name,
      email: shopInfo.email,
    },
    stats: {
      ordersCount: (ordersCountData as { count?: number }).count || 0,
      productsCount: (productsCountData as { count?: number }).count || 0,
      revenue30d: revenueStats.revenue30d,
      avgOrderValue: revenueStats.avgOrderValue,
      currency: shopInfo.currency || "USD",
    },
    orders: formattedOrders,
  };
}
