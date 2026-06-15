import {
  calculateShopifyRevenueStats,
  buildShopifyDailyRevenue,
  topShopifyProducts,
  type ShopifyOrderInput,
} from "../analytics/shopifyMetrics.ts";

type ShopifyOrder = ShopifyOrderInput & {
  id: string | number;
  name?: string;
  email?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string;
  customer?: { id?: number | string; first_name?: string; last_name?: string; email?: string };
};

type ShopifyCustomer = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  orders_count?: number | string;
  total_spent?: string;
  currency?: string;
  created_at?: string;
};

type ShopifyCheckout = {
  id: number | string;
  token?: string;
  email?: string;
  total_price?: string;
  currency?: string;
  abandoned_checkout_url?: string;
  created_at?: string;
  updated_at?: string;
};

type ShopifyProductVariant = {
  id: number | string;
  title?: string;
  sku?: string;
  inventory_quantity?: number;
  inventory_management?: string | null;
  price?: string;
};

type ShopifyProduct = {
  id: number | string;
  title?: string;
  status?: string;
  variants?: ShopifyProductVariant[];
};

type ShopifyPriceRule = {
  id: number | string;
  title?: string;
  value_type?: string;
  value?: string;
  target_type?: string;
  starts_at?: string;
  ends_at?: string | null;
  usage_count?: number;
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
const SHOPIFY_ADMIN_API_VERSION = "2025-01";
const LOW_STOCK_THRESHOLD = 5;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isoNDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export interface ShopifyRevenueSummary {
  windowDays: number;
  revenue: number;
  orders: number;
  currency: string | null;
}

/**
 * Lightweight gross-sales summary for the trailing `days` window — one orders
 * call, just enough to compute marketing ROAS without the full account-data
 * fan-out. Cancelled orders are excluded. Returns null on any failure so the
 * caller can treat "no Shopify data" uniformly.
 */
export async function fetchShopifyRevenueSummary(
  accessToken: string,
  shop: string | undefined,
  days = 7,
): Promise<ShopifyRevenueSummary | null> {
  if (!accessToken || !shop) return null;
  const apiBase = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}`;
  const since = isoNDaysAgo(days);
  const url =
    `${apiBase}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}` +
    `&fields=total_price,currency,cancelled_at,created_at`;
  try {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { orders?: ShopifyOrder[] };
    const orders = Array.isArray(body.orders) ? body.orders : [];
    let revenue = 0;
    let count = 0;
    let currency: string | null = null;
    for (const o of orders) {
      if ((o as { cancelled_at?: string | null })?.cancelled_at) continue;
      revenue += toNumber(o?.total_price);
      count += 1;
      if (!currency && o?.currency) currency = String(o.currency);
    }
    return { windowDays: days, revenue, orders: count, currency };
  } catch {
    return null;
  }
}

export interface ShopifyStockSummary {
  threshold: number;
  outOfStock: number;
  lowStock: number;
  examples: string[];
}

/**
 * Lightweight inventory health check — one products call, counts active
 * products that are out of or low on stock (only variants that actually track
 * inventory). Used to flag "you're advertising but the shelves are empty".
 */
export async function fetchShopifyLowStock(
  accessToken: string,
  shop: string | undefined,
  threshold = LOW_STOCK_THRESHOLD,
): Promise<ShopifyStockSummary | null> {
  if (!accessToken || !shop) return null;
  const apiBase = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}`;
  const url = `${apiBase}/products.json?status=active&limit=250&fields=id,title,status,variants`;
  try {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { products?: ShopifyProduct[] };
    const products = Array.isArray(body.products) ? body.products : [];
    let outOfStock = 0;
    let lowStock = 0;
    const examples: string[] = [];
    for (const product of products) {
      const tracked = (product.variants || []).filter((v) => v.inventory_management);
      if (tracked.length === 0) continue;
      const quantities = tracked.map((v) => toNumber(v.inventory_quantity));
      const maxQty = Math.max(...quantities);
      if (maxQty <= 0) {
        outOfStock += 1;
        if (examples.length < 3) examples.push(String(product.title || "Produkt"));
      } else if (maxQty <= threshold) {
        lowStock += 1;
        if (examples.length < 3) examples.push(String(product.title || "Produkt"));
      }
    }
    return { threshold, outOfStock, lowStock, examples };
  } catch {
    return null;
  }
}

export async function fetchShopifyAccountData(accessToken: string, shop: string | undefined) {
  if (!shop) {
    return { error: "No shop domain stored for this account", status: 400 };
  }

  const shopHeaders = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  const apiBase = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}`;
  const since30d = isoNDaysAgo(30);
  const since90d = isoNDaysAgo(90);

  async function safeJson<T>(res: Response, fallback: T): Promise<T> {
    if (!res.ok) return fallback;
    try {
      return (await res.json()) as T;
    } catch {
      return fallback;
    }
  }

  const [
    shopRes,
    ordersRes,
    productsCountRes,
    ordersCountRes,
    customersCountRes,
    topCustomersRes,
    checkoutsRes,
    productsRes,
    priceRulesRes,
    new30dCustomersRes,
  ] = await Promise.all([
    fetch(`${apiBase}/shop.json`, { headers: shopHeaders }),
    fetch(
      `${apiBase}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since30d)}&order=created_at+desc&fields=id,name,email,total_price,subtotal_price,total_discounts,currency,financial_status,fulfillment_status,created_at,processed_at,line_items,customer`,
      { headers: shopHeaders }
    ),
    fetch(`${apiBase}/products/count.json`, { headers: shopHeaders }),
    fetch(`${apiBase}/orders/count.json?status=any`, { headers: shopHeaders }),
    fetch(`${apiBase}/customers/count.json`, { headers: shopHeaders }),
    fetch(`${apiBase}/customers.json?limit=10&order=total_spent+desc&fields=id,first_name,last_name,email,orders_count,total_spent,currency`, {
      headers: shopHeaders,
    }),
    fetch(
      `${apiBase}/checkouts.json?limit=50&created_at_min=${encodeURIComponent(since30d)}&status=open`,
      { headers: shopHeaders }
    ),
    fetch(`${apiBase}/products.json?limit=50&fields=id,title,status,variants`, { headers: shopHeaders }),
    fetch(`${apiBase}/price_rules.json?limit=10`, { headers: shopHeaders }),
    fetch(`${apiBase}/customers/count.json?created_at_min=${encodeURIComponent(since30d)}`, {
      headers: shopHeaders,
    }),
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

  if (!ordersRes.ok && ordersRes.status === 401) {
    const raw = await ordersRes.json().catch(() => ({}));
    return {
      error: formatShopifyErrors(raw) || "Shopify token invalid while loading orders. Reconnect the store.",
      status: 401,
    };
  }

  const shopData = await safeJson<{ shop?: Record<string, unknown> }>(shopRes, {});
  const ordersData = await safeJson<{ orders?: ShopifyOrder[] }>(ordersRes, { orders: [] });
  const productsCountData = await safeJson<{ count?: number }>(productsCountRes, { count: 0 });
  const ordersCountData = await safeJson<{ count?: number }>(ordersCountRes, { count: 0 });
  const customersCountData = await safeJson<{ count?: number }>(customersCountRes, { count: 0 });
  const topCustomersData = await safeJson<{ customers?: ShopifyCustomer[] }>(topCustomersRes, {
    customers: [],
  });
  const checkoutsData = await safeJson<{ checkouts?: ShopifyCheckout[] }>(checkoutsRes, {
    checkouts: [],
  });
  const productsData = await safeJson<{ products?: ShopifyProduct[] }>(productsRes, { products: [] });
  const priceRulesData = await safeJson<{ price_rules?: ShopifyPriceRule[] }>(priceRulesRes, {
    price_rules: [],
  });
  const new30dCustomersData = await safeJson<{ count?: number }>(new30dCustomersRes, { count: 0 });

  const shopInfo = (shopData.shop || {}) as Record<string, unknown>;
  const orders = ordersData.orders || [];
  const checkouts = checkoutsData.checkouts || [];
  const products = productsData.products || [];
  const priceRules = priceRulesData.price_rules || [];
  const topCustomers = topCustomersData.customers || [];

  const currency =
    (typeof shopInfo.currency === "string" && shopInfo.currency) ||
    (orders[0]?.currency as string | undefined) ||
    "USD";

  const revenueStats = calculateShopifyRevenueStats(orders);
  const dailyRevenue = buildShopifyDailyRevenue(orders, 30);
  const topProducts = topShopifyProducts(orders, 5);

  const formattedOrders = orders.slice(0, 25).map((o) => ({
    id: o.id,
    name: o.name,
    email: o.email || o.customer?.email || "",
    customer: o.customer
      ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ").trim() || null
      : null,
    total: toNumber(o.total_price),
    subtotal: toNumber(o.subtotal_price),
    discount: toNumber(o.total_discounts),
    currency: o.currency || currency,
    status: o.financial_status || "pending",
    fulfillment: o.fulfillment_status || "unfulfilled",
    createdAt: o.created_at,
    lineItemCount: (o.line_items || []).length,
  }));

  const formattedCustomers = topCustomers
    .map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Anonymous",
      email: c.email || "",
      ordersCount: toNumber(c.orders_count),
      totalSpent: toNumber(c.total_spent),
      currency: c.currency || currency,
    }))
    .filter((c) => c.totalSpent > 0)
    .slice(0, 5);

  const abandonedTotal = checkouts.reduce((sum, c) => sum + toNumber(c.total_price), 0);
  const formattedAbandoned = checkouts
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      email: c.email || "",
      total: toNumber(c.total_price),
      currency: c.currency || currency,
      createdAt: c.created_at,
      recoveryUrl: c.abandoned_checkout_url || null,
    }))
    .filter((c) => c.total > 0);

  const lowStockItems: Array<{
    productId: string | number;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
  }> = [];
  for (const product of products) {
    if (product.status && product.status !== "active") continue;
    for (const variant of product.variants || []) {
      if (!variant.inventory_management) continue;
      const qty = toNumber(variant.inventory_quantity, Number.POSITIVE_INFINITY);
      if (qty <= LOW_STOCK_THRESHOLD) {
        lowStockItems.push({
          productId: product.id,
          productTitle: product.title || "Untitled product",
          variantTitle: variant.title && variant.title !== "Default Title" ? variant.title : null,
          sku: variant.sku || null,
          quantity: qty,
        });
      }
    }
  }
  lowStockItems.sort((a, b) => a.quantity - b.quantity);

  const now = Date.now();
  const activePriceRules = priceRules.filter((p) => {
    if (!p.ends_at) return true;
    const ends = new Date(p.ends_at).getTime();
    return Number.isFinite(ends) ? ends > now : true;
  });
  const promotions = activePriceRules.slice(0, 5).map((p) => ({
    id: p.id,
    title: p.title || "Untitled rule",
    value: p.value ?? null,
    valueType: p.value_type ?? null,
    targetType: p.target_type ?? null,
    startsAt: p.starts_at ?? null,
    endsAt: p.ends_at ?? null,
    usageCount: toNumber(p.usage_count),
  }));

  const totalOrdersCount = toNumber(ordersCountData.count);
  const ordersInWindow = orders.length;
  const fulfilledInWindow = orders.filter((o) => o.fulfillment_status === "fulfilled").length;
  const fulfillmentRate30d =
    ordersInWindow > 0 ? Math.round((fulfilledInWindow / ordersInWindow) * 100) : null;
  const conversionEstimate30d =
    checkouts.length + ordersInWindow > 0
      ? Math.round((ordersInWindow / (checkouts.length + ordersInWindow)) * 100)
      : null;

  const adminBase = `https://${shop}/admin`;

  return {
    shop: {
      name: (shopInfo.name as string | undefined) || shop,
      domain: (shopInfo.domain as string | undefined) || shop,
      myshopifyDomain: shop,
      currency,
      plan: (shopInfo.plan_display_name as string | undefined) || (shopInfo.plan_name as string | undefined) || null,
      email: (shopInfo.email as string | undefined) || null,
      country: (shopInfo.country_name as string | undefined) || (shopInfo.country as string | undefined) || null,
      timezone: (shopInfo.iana_timezone as string | undefined) || (shopInfo.timezone as string | undefined) || null,
      primaryLocale: (shopInfo.primary_locale as string | undefined) || null,
      adminUrl: adminBase,
      storefrontUrl: shopInfo.domain ? `https://${shopInfo.domain}` : `https://${shop}`,
    },
    stats: {
      ordersCount: totalOrdersCount,
      ordersWindow: ordersInWindow,
      productsCount: toNumber(productsCountData.count),
      customersCount: toNumber(customersCountData.count),
      newCustomers30d: toNumber(new30dCustomersData.count),
      revenue30d: revenueStats.revenue30d,
      avgOrderValue: revenueStats.avgOrderValue,
      abandonedCheckouts30d: checkouts.length,
      abandonedValue30d: Math.round(abandonedTotal * 100) / 100,
      fulfillmentRate30d,
      conversionEstimate30d,
      lowStockCount: lowStockItems.length,
      activePromotions: activePriceRules.length,
      currency,
    },
    orders: formattedOrders,
    topProducts,
    topCustomers: formattedCustomers,
    abandonedCheckouts: formattedAbandoned,
    lowStock: lowStockItems.slice(0, 8),
    promotions,
    revenueTrend: dailyRevenue,
    adminLinks: {
      orders: `${adminBase}/orders`,
      products: `${adminBase}/products`,
      customers: `${adminBase}/customers`,
      analytics: `${adminBase}/analytics/dashboards`,
      discounts: `${adminBase}/discounts`,
      checkouts: `${adminBase}/checkouts/abandoned`,
    },
  };
}

type ShopifyProductImage = {
  id?: number | string;
  src?: string;
  alt?: string | null;
};

type ShopifyFullProduct = {
  id: number | string;
  title?: string;
  body_html?: string | null;
  handle?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status?: string;
  images?: ShopifyProductImage[];
  image?: ShopifyProductImage | null;
  variants?: Array<
    ShopifyProductVariant & { image_id?: number | string | null }
  >;
};

/** Strip HTML tags/entities to a plain-text description we can edit safely. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type NormalizedShopifyProduct = {
  externalId: string;
  title: string;
  description: string;
  price: string | null;
  currency: string;
  status: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  handle: string | null;
  adminUrl: string;
  images: Array<{ src: string; alt: string | null }>;
  variants: Array<{ id: string; title: string; price: string | null; sku: string | null }>;
};

/**
 * Pure mapping from Shopify's raw products payload to our normalized catalogue
 * shape. Extracted from {@link fetchShopifyProducts} so it can be unit-tested
 * without hitting the network.
 */
export function normalizeShopifyProducts(
  products: ShopifyFullProduct[],
  currency: string,
  shop: string
): NormalizedShopifyProduct[] {
  const adminBase = `https://${shop}/admin`;
  return products.map((p) => {
    const variants = p.variants || [];
    const firstPrice = variants.find((v) => v.price != null)?.price;
    const images = (p.images && p.images.length > 0 ? p.images : p.image ? [p.image] : [])
      .map((img) => ({ src: String(img?.src || ""), alt: img?.alt ?? null }))
      .filter((img) => img.src);
    return {
      externalId: String(p.id),
      title: p.title || "Untitled product",
      description: htmlToText(p.body_html),
      price: firstPrice != null ? String(firstPrice) : null,
      currency,
      status: p.status ?? null,
      vendor: p.vendor || null,
      productType: p.product_type || null,
      tags: (p.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      handle: p.handle || null,
      adminUrl: `${adminBase}/products/${p.id}`,
      images,
      variants: variants.map((v) => ({
        id: String(v.id),
        title: v.title && v.title !== "Default Title" ? v.title : "",
        price: v.price != null ? String(v.price) : null,
        sku: v.sku || null,
      })),
    };
  });
}

/**
 * Pull the full product catalogue from a Shopify store (title, description,
 * images, variants, vendor, etc.) so it can be mirrored into our `products`
 * table. Distinct from {@link fetchShopifyAccountData}, which only returns the
 * trimmed analytics slice the dashboard needs.
 */
export async function fetchShopifyProducts(
  accessToken: string,
  shop: string | undefined,
  limit = 100
): Promise<
  | { error: string; status: number }
  | { products: NormalizedShopifyProduct[]; currency: string }
> {
  if (!shop) {
    return { error: "No shop domain stored for this account", status: 400 };
  }

  const shopHeaders = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  const apiBase = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}`;
  const cappedLimit = Math.min(250, Math.max(1, limit));

  const [shopRes, productsRes] = await Promise.all([
    fetch(`${apiBase}/shop.json?fields=currency`, { headers: shopHeaders }),
    fetch(
      `${apiBase}/products.json?limit=${cappedLimit}&fields=id,title,body_html,handle,vendor,product_type,tags,status,images,image,variants`,
      { headers: shopHeaders }
    ),
  ]);

  if (!productsRes.ok) {
    const raw = await productsRes.json().catch(() => ({}));
    const detail = formatShopifyErrors(raw);
    if (productsRes.status === 401) {
      return { error: detail || "Shopify rejected the access token. Reconnect the store.", status: 401 };
    }
    if (productsRes.status === 403) {
      return {
        error: detail || "Shopify denied reading products. Reconnect to grant read_products scope.",
        status: 403,
      };
    }
    return { error: detail || "Could not fetch Shopify products", status: productsRes.status };
  }

  const shopData = await shopRes.json().catch(() => ({}));
  const currency =
    (shopData?.shop?.currency && String(shopData.shop.currency)) || "USD";
  const productsData = (await productsRes.json().catch(() => ({}))) as {
    products?: ShopifyFullProduct[];
  };
  const products = productsData.products || [];

  return { products: normalizeShopifyProducts(products, currency, shop), currency };
}

type ShopifyDraftImageInput = {
  filename: string;
  attachment: string;
};

export async function createShopifyDraftProduct(
  accessToken: string,
  shop: string | undefined,
  input: {
    title: string;
    description: string;
    price?: string | null;
    sourceUrl?: string | null;
    images?: ShopifyDraftImageInput[];
  }
) {
  if (!shop) {
    return { error: "No shop domain stored for this account", status: 400 };
  }

  const shopHeaders = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  const apiBase = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}`;
  const price = String(input.price || "").replace(/[^\d.,]/g, "").replace(",", ".");
  const parsedPrice = parseFloat(price);
  const variantPrice = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice.toFixed(2) : "0.00";
  const bodyHtml = [
    input.description.trim(),
    input.sourceUrl ? `<p><a href="${input.sourceUrl}" rel="nofollow">Source product</a></p>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const payload = {
    product: {
      title: input.title.trim() || "Imported product",
      body_html: bodyHtml,
      status: "draft",
      variants: [{ price: variantPrice }],
      ...(input.images && input.images.length > 0 ? { images: input.images.slice(0, 10) } : {}),
    },
  };

  const res = await fetch(`${apiBase}/products.json`, {
    method: "POST",
    headers: shopHeaders,
    body: JSON.stringify(payload),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = formatShopifyErrors(raw);
    if (res.status === 401) {
      return { error: detail || "Shopify rejected the access token. Reconnect the store.", status: 401 };
    }
    if (res.status === 403) {
      return {
        error:
          detail ||
          "Shopify denied product creation. Reconnect the store to grant write_products scope.",
        status: 403,
      };
    }
    return { error: detail || "Could not create Shopify product", status: res.status };
  }

  const product = (raw as { product?: Record<string, unknown> }).product || {};
  const productId = product.id;
  const adminBase = `https://${shop}/admin`;
  return {
    product: {
      id: productId,
      title: String(product.title || input.title),
      status: String(product.status || "draft"),
      adminUrl: productId ? `${adminBase}/products/${productId}` : `${adminBase}/products`,
    },
  };
}
