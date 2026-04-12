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

function formatShopifyErrors(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data !== "object") return "";
  const o = data as { errors?: unknown; error?: unknown; message?: string };
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  const errs = o.errors;
  if (typeof errs === "string" && errs.trim()) return errs.trim();
  if (Array.isArray(errs) && errs.length) return errs.map((e) => String(e)).join("; ");
  if (errs && typeof errs === "object") {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(errs as Record<string, unknown>)) {
      if (Array.isArray(v)) parts.push(`${k}: ${v.join(", ")}`);
      else if (v != null) parts.push(`${k}: ${String(v)}`);
    }
    if (parts.length) return parts.join("; ");
  }
  return "";
}

/** Shopify Admin REST API version — see https://shopify.dev/docs/api/admin-rest */
const SHOPIFY_ADMIN_API_VERSION = "2024-01";

export async function fetchShopifyAccountData(accessToken: string, shop: string | undefined) {
  if (!shop) {
    return { error: "No shop domain stored for this account", status: 400 };
  }

  const shopHeaders = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  const apiBase = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}`;

  const [shopRes, ordersRes, productsCountRes, ordersCountRes] = await Promise.all([
    fetch(`${apiBase}/shop.json`, { headers: shopHeaders }),
    fetch(`${apiBase}/orders.json?status=any&limit=10&order=created_at+desc`, { headers: shopHeaders }),
    fetch(`${apiBase}/products/count.json`, { headers: shopHeaders }),
    fetch(`${apiBase}/orders/count.json?status=any`, { headers: shopHeaders }),
  ]);

  if (!shopRes.ok) {
    const raw = await shopRes.json().catch(() => ({}));
    const detail = formatShopifyErrors(raw);
    if (shopRes.status === 401) {
      return {
        error:
          detail ||
          "Shopify rejected the access token (401). Reinstall or reconnect the app in Shopify Admin so a new token is issued.",
        status: 401,
      };
    }
    if (shopRes.status === 402 || shopRes.status === 403) {
      return {
        error:
          detail ||
          `Shopify returned ${shopRes.status}. Check that the app is installed, billing is active, and required scopes are granted.`,
        status: shopRes.status,
      };
    }
    return {
      error: detail || "Could not fetch Shopify store data",
      status: shopRes.status >= 400 && shopRes.status < 600 ? shopRes.status : 502,
    };
  }

  const [shopData, ordersData, productsCountData, ordersCountData] = await Promise.all([
    shopRes.json(),
    ordersRes.ok ? ordersRes.json() : { orders: [] },
    productsCountRes.ok ? productsCountRes.json() : { count: 0 },
    ordersCountRes.ok ? ordersCountRes.json() : { count: 0 },
  ]);

  if (!ordersRes.ok && ordersRes.status === 401) {
    const raw = await ordersRes.json().catch(() => ({}));
    return {
      error: formatShopifyErrors(raw) || "Shopify token invalid while loading orders. Reconnect the store.",
      status: 401,
    };
  }

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
