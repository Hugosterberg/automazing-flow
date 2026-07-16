import { formatShortDate, formatSmartDate } from "@/lib/format";
import type { ConnectedAccount } from "@/types/accounts";

export function sortOrgAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "shopify" ? 0 : p === "notion" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

export interface ShopifyStats {
  ordersCount: number;
  ordersWindow: number;
  productsCount: number;
  customersCount: number;
  newCustomers30d: number;
  revenue30d: number;
  avgOrderValue: number;
  abandonedCheckouts30d: number;
  abandonedValue30d: number;
  fulfillmentRate30d: number | null;
  conversionEstimate30d: number | null;
  lowStockCount: number;
  activePromotions: number;
  currency: string;
}

export interface ShopifyOrderLineItem {
  id: number | string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  price: number;
}

export interface ShopifyOrder {
  id: number | string;
  name: string;
  email: string;
  customer: string | null;
  total: number;
  subtotal: number;
  discount: number;
  currency: string;
  status: string;
  fulfillment: string;
  createdAt: string;
  lineItemCount: number;
  /** Optional: older cached payloads may not include expanded line items. */
  lineItems?: ShopifyOrderLineItem[];
}

export interface TopProduct {
  productId: number | string | null;
  title: string;
  quantity: number;
  revenue: number;
}

export interface TopCustomer {
  id: number | string;
  name: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
  currency: string;
}

export interface AbandonedCheckout {
  id: number | string;
  email: string;
  total: number;
  currency: string;
  createdAt: string | undefined;
  recoveryUrl: string | null;
}

export interface LowStockItem {
  productId: number | string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
}

export interface Promotion {
  id: number | string;
  title: string;
  value: string | null;
  valueType: string | null;
  targetType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usageCount: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface ShopifyData {
  shop: {
    name: string;
    domain: string;
    myshopifyDomain: string;
    currency: string;
    plan: string | null;
    email: string | null;
    country: string | null;
    timezone: string | null;
    primaryLocale: string | null;
    adminUrl: string;
    storefrontUrl: string;
  };
  stats: ShopifyStats;
  orders: ShopifyOrder[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  abandonedCheckouts: AbandonedCheckout[];
  lowStock: LowStockItem[];
  promotions: Promotion[];
  revenueTrend: RevenuePoint[];
  adminLinks: {
    orders: string;
    products: string;
    customers: string;
    analytics: string;
    discounts: string;
    checkouts: string;
  };
}

export interface NotionEntry {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
}

export interface NotionData {
  workspace: { name: string; type: string; botId: string };
  stats: { pagesCount: number; databasesCount: number };
  pages: NotionEntry[];
  databases: NotionEntry[];
  canWrite: boolean;
}

export interface NotionParentOption {
  id: string;
  title: string;
  type: "page_id" | "database_id";
  lastEditedLabel: string;
}

export type OrganizationData = ShopifyData | NotionData | null;

export function isShopifyData(data: OrganizationData): data is ShopifyData {
  return Boolean(data && "shop" in data && "orders" in data);
}

export function isNotionData(data: OrganizationData): data is NotionData {
  return Boolean(data && "workspace" in data && "pages" in data);
}

export function formatDate(iso: string | undefined) {
  return formatSmartDate(iso) || "—";
}

export function formatChartDate(iso: string) {
  return formatShortDate(iso) || iso;
}
