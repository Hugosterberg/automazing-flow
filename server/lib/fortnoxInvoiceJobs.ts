/**
 * Fortnox invoice suggestion queue — detects paid + fulfilled Shopify orders
 * that haven't been billed in Fortnox yet and queues them for approval.
 * Nothing is ever created in Fortnox automatically: the cron only *suggests*
 * (mirrors the "suggest, then approve" pattern used across the app for any
 * action that touches money). The actual invoice is created by
 * `createQueuedFortnoxInvoice`, called from a user-triggered endpoint.
 *
 * Row prices are treated as VAT-exclusive when sent to Fortnox — see the
 * caveat on `createFortnoxInvoice` in the provider. Verify this matches the
 * tenant's Fortnox/Shopify tax setup before relying on the totals.
 */

import {
  createFortnoxCustomer,
  createFortnoxInvoice,
  createFortnoxCreditInvoice,
  fetchFortnoxArticles,
  createFortnoxArticle,
  recordFortnoxInvoicePayment,
  fetchFortnoxInvoiceHistory,
} from "../providers/fortnox.ts";
import { fetchShopifyFulfilledOrders, fetchShopifyRefundedOrders } from "../providers/shopify.ts";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentStore.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export const FORTNOX_INVOICE_QUEUE_DOC_KEY = "fortnox-invoice-queue";
const FORTNOX_CUSTOMER_MAP_DOC_KEY = "fortnox-customer-map";
const FORTNOX_ARTICLE_MAP_DOC_KEY = "fortnox-article-map";
export const FORTNOX_CREDIT_QUEUE_DOC_KEY = "fortnox-credit-queue";

export interface FortnoxInvoiceQueueLineItem {
  title: string;
  quantity: number;
  price: number;
}

export interface FortnoxInvoiceQueueItem {
  id: string;
  orderId: string;
  orderName: string;
  customerEmail: string;
  customerName: string | null;
  total: number;
  currency: string;
  lineItems: FortnoxInvoiceQueueLineItem[];
  status: "suggested" | "created" | "dismissed" | "failed";
  fortnoxInvoiceNumber?: string;
  error?: string;
  createdAt: string;
}

export function parseFortnoxInvoiceQueue(data: unknown): FortnoxInvoiceQueueItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is FortnoxInvoiceQueueItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as FortnoxInvoiceQueueItem).id === "string" &&
      typeof (e as FortnoxInvoiceQueueItem).orderId === "string"
  );
}

function parseCustomerMap(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const raw = data as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [email, customerNumber] of Object.entries(raw)) {
    if (typeof customerNumber === "string" && customerNumber.trim()) out[email] = customerNumber;
  }
  return out;
}

/**
 * Resolve a Fortnox ArticleNumber for a line item title, creating a new
 * article the first time a title is billed. Best-effort: article lookup
 * failures never block invoice creation — the row just falls back to a
 * freeform description without an ArticleNumber.
 */
async function findOrCreateArticleNumbers(
  supabaseAdmin: SupabaseAdminLike,
  businessProfileId: string,
  accessToken: string,
  titles: string[]
): Promise<Record<string, string>> {
  const uniqueTitles = [...new Set(titles.filter(Boolean))];
  if (uniqueTitles.length === 0) return {};

  const mapDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_ARTICLE_MAP_DOC_KEY);
  const map = parseCustomerMap(mapDoc?.data); // same {key: value} shape as the customer map
  const missing = uniqueTitles.filter((t) => !map[t]);
  if (missing.length === 0) return map;

  const existing = await fetchFortnoxArticles(accessToken, 500);
  const byDescription = new Map<string, string>();
  if (existing.ok) {
    for (const article of existing.articles) {
      if (article.description) byDescription.set(article.description, article.articleNumber);
    }
  }

  const nextMap = { ...map };
  let changed = false;
  for (const title of missing.slice(0, 20)) {
    const matched = byDescription.get(title);
    if (matched) {
      nextMap[title] = matched;
      changed = true;
      continue;
    }
    const created = await createFortnoxArticle(accessToken, { description: title });
    if (!("error" in created)) {
      nextMap[title] = created.articleNumber;
      changed = true;
    }
  }

  if (changed) {
    await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_ARTICLE_MAP_DOC_KEY, nextMap);
  }
  return nextMap;
}

const INVOICE_SUGGEST_MIN_DAYS_AGO = 1;
const INVOICE_SUGGEST_MAX_DAYS_AGO = 30;
const MAX_QUEUED_PER_RUN = 10;
const MAX_QUEUE_STORED = 300;

/** Scan recent paid+fulfilled Shopify orders and queue any not seen before. */
export async function runFortnoxInvoiceSuggest(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  accessToken: string;
  shop: string;
}): Promise<{ queued: number; skipped: number }> {
  const { supabaseAdmin, businessProfileId, accessToken, shop } = deps;

  const orders = await fetchShopifyFulfilledOrders(accessToken, shop, {
    minDaysAgo: INVOICE_SUGGEST_MIN_DAYS_AGO,
    maxDaysAgo: INVOICE_SUGGEST_MAX_DAYS_AGO,
    limit: 50,
  });
  if (orders.length === 0) return { queued: 0, skipped: 0 };

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
  const queue = parseFortnoxInvoiceQueue(doc?.data);
  const known = new Set(queue.map((q) => q.orderId));

  const newItems: FortnoxInvoiceQueueItem[] = [];
  for (const order of orders) {
    if (known.has(order.id)) continue;
    if (newItems.length >= MAX_QUEUED_PER_RUN) break;
    newItems.push({
      id: order.id,
      orderId: order.id,
      orderName: order.name,
      customerEmail: order.email,
      customerName: order.customerName,
      total: order.total,
      currency: order.currency,
      lineItems: order.lineItems,
      status: "suggested",
      createdAt: new Date().toISOString(),
    });
  }
  if (newItems.length === 0) return { queued: 0, skipped: orders.length };

  const nextQueue = [...newItems, ...queue].slice(0, MAX_QUEUE_STORED);
  await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY, nextQueue);
  return { queued: newItems.length, skipped: orders.length - newItems.length };
}

/**
 * Create the actual Fortnox invoice for one queued (approved) suggestion.
 * Reuses a previously-created Fortnox customer for the same email when we
 * have one on record; otherwise creates a new Fortnox Customer first.
 */
export async function createQueuedFortnoxInvoice(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  orderId: string;
  fortnoxAccessToken: string;
}): Promise<{ ok: true; invoiceNumber: string } | { ok: false; error: string }> {
  const { supabaseAdmin, businessProfileId, orderId, fortnoxAccessToken } = deps;

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
  const queue = parseFortnoxInvoiceQueue(doc?.data);
  const item = queue.find((q) => q.orderId === orderId && (q.status === "suggested" || q.status === "failed"));
  if (!item) return { ok: false, error: "queue_item_not_found" };

  const customerMapDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CUSTOMER_MAP_DOC_KEY);
  const customerMap = parseCustomerMap(customerMapDoc?.data);

  let customerNumber = customerMap[item.customerEmail];
  if (!customerNumber) {
    const created = await createFortnoxCustomer(fortnoxAccessToken, {
      name: item.customerName || item.customerEmail,
      email: item.customerEmail,
    });
    if ("error" in created) {
      const errorMessage = created.error;
      const nextQueue = queue.map((q) => (q.orderId === orderId ? { ...q, status: "failed" as const, error: errorMessage } : q));
      await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY, nextQueue);
      return { ok: false, error: errorMessage };
    }
    customerNumber = created.customerNumber;
    await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CUSTOMER_MAP_DOC_KEY, {
      ...customerMap,
      [item.customerEmail]: customerNumber,
    });
  }

  const articleNumbers = await findOrCreateArticleNumbers(
    supabaseAdmin,
    businessProfileId,
    fortnoxAccessToken,
    item.lineItems.map((li) => li.title)
  );

  const invoiceResult = await createFortnoxInvoice(fortnoxAccessToken, {
    customerNumber,
    yourOrderNumber: item.orderName,
    currency: item.currency,
    rows: item.lineItems.map((li) => ({
      description: li.title,
      price: li.price,
      quantity: li.quantity,
      articleNumber: articleNumbers[li.title],
    })),
  });

  if ("error" in invoiceResult) {
    const errorMessage = invoiceResult.error;
    const nextQueue = queue.map((q) =>
      q.orderId === orderId ? { ...q, status: "failed" as const, error: errorMessage } : q
    );
    await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY, nextQueue);
    return { ok: false, error: errorMessage };
  }

  const nextQueue = queue.map((q) =>
    q.orderId === orderId
      ? { ...q, status: "created" as const, fortnoxInvoiceNumber: invoiceResult.invoiceNumber, error: undefined }
      : q
  );
  await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY, nextQueue);
  return { ok: true, invoiceNumber: invoiceResult.invoiceNumber };
}

export async function dismissFortnoxInvoiceSuggestion(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  orderId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin, businessProfileId, orderId } = deps;
  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
  const queue = parseFortnoxInvoiceQueue(doc?.data);
  if (!queue.some((q) => q.orderId === orderId)) return { ok: false, error: "queue_item_not_found" };
  const nextQueue = queue.map((q) => (q.orderId === orderId ? { ...q, status: "dismissed" as const } : q));
  await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY, nextQueue);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payment sync (auto — no approval step). Registering a payment against an
// invoice we already created is a status sync of something that already
// happened (the customer paid via Shopify), not a new financial decision, so
// this runs automatically unlike invoice/credit creation above.
// ---------------------------------------------------------------------------

const PAYMENT_SYNC_LOOKBACK_DAYS = 60;
const MAX_PAYMENTS_PER_RUN = 15;

/**
 * Match unpaid Fortnox invoices (created by this app, tracked in the invoice
 * queue) against their Shopify order's payment status, and register the
 * payment in Fortnox once Shopify shows the order as paid.
 */
export async function runFortnoxPaymentSync(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  fortnoxAccessToken: string;
  shopifyAccessToken: string;
  shop: string;
}): Promise<{ paid: number; skipped: number; failed: number }> {
  const { supabaseAdmin, businessProfileId, fortnoxAccessToken, shopifyAccessToken, shop } = deps;

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
  const queue = parseFortnoxInvoiceQueue(doc?.data);
  const createdInvoices = queue.filter((q) => q.status === "created" && q.fortnoxInvoiceNumber);
  if (createdInvoices.length === 0) return { paid: 0, skipped: 0, failed: 0 };

  const history = await fetchFortnoxInvoiceHistory(fortnoxAccessToken, { status: "unpaid", limit: 500 });
  if (!history.ok) return { paid: 0, skipped: createdInvoices.length, failed: 0 };
  const unpaidByNumber = new Map(history.invoices.map((inv) => [inv.invoiceNumber, inv]));

  const stillUnpaid = createdInvoices.filter((q) => unpaidByNumber.has(q.fortnoxInvoiceNumber!));
  if (stillUnpaid.length === 0) return { paid: 0, skipped: createdInvoices.length, failed: 0 };

  const orders = await fetchShopifyFulfilledOrders(shopifyAccessToken, shop, {
    minDaysAgo: 0,
    maxDaysAgo: PAYMENT_SYNC_LOOKBACK_DAYS,
    limit: 100,
  });
  const paidOrderIds = new Set(orders.map((o) => o.id));

  let paid = 0;
  let skipped = 0;
  let failed = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const item of stillUnpaid.slice(0, MAX_PAYMENTS_PER_RUN)) {
    if (!paidOrderIds.has(item.orderId)) {
      skipped += 1;
      continue;
    }
    const invoiceRow = unpaidByNumber.get(item.fortnoxInvoiceNumber!)!;
    const result = await recordFortnoxInvoicePayment(fortnoxAccessToken, {
      invoiceNumber: item.fortnoxInvoiceNumber!,
      amount: invoiceRow.balance || invoiceRow.total,
      paymentDate: today,
    });
    if ("error" in result) {
      failed += 1;
      console.warn(
        `[fortnox-payment-sync] bp=${businessProfileId} invoice=${item.fortnoxInvoiceNumber} failed:`,
        result.error
      );
      continue;
    }
    paid += 1;
  }

  return { paid, skipped: skipped + (createdInvoices.length - stillUnpaid.length), failed };
}

// ---------------------------------------------------------------------------
// Refund → credit invoice suggestion queue. A new financial document, so —
// unlike payment sync above — this always requires an explicit approval.
// ---------------------------------------------------------------------------

export interface FortnoxCreditQueueLineItem {
  title: string;
  quantity: number;
  subtotal: number;
}

export interface FortnoxCreditQueueItem {
  id: string;
  orderId: string;
  refundId: string;
  orderName: string;
  /** DocumentNumber of the original Fortnox invoice this credit references. */
  invoiceReference: string;
  lineItems: FortnoxCreditQueueLineItem[];
  status: "suggested" | "created" | "dismissed" | "failed";
  creditInvoiceNumber?: string;
  error?: string;
  createdAt: string;
}

export function parseFortnoxCreditQueue(data: unknown): FortnoxCreditQueueItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is FortnoxCreditQueueItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as FortnoxCreditQueueItem).id === "string" &&
      typeof (e as FortnoxCreditQueueItem).refundId === "string"
  );
}

const CREDIT_SUGGEST_MIN_DAYS_AGO = 0;
const CREDIT_SUGGEST_MAX_DAYS_AGO = 30;
const MAX_CREDITS_QUEUED_PER_RUN = 10;
const MAX_CREDIT_QUEUE_STORED = 300;

/**
 * Scan recent Shopify refunds and queue a credit-invoice suggestion for each
 * one whose order already has a Fortnox invoice on record (refunds on orders
 * we never billed in Fortnox have nothing to credit, so they're skipped).
 */
export async function runFortnoxRefundCreditSuggest(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  accessToken: string;
  shop: string;
}): Promise<{ queued: number; skipped: number }> {
  const { supabaseAdmin, businessProfileId, accessToken, shop } = deps;

  const refundedOrders = await fetchShopifyRefundedOrders(accessToken, shop, {
    minDaysAgo: CREDIT_SUGGEST_MIN_DAYS_AGO,
    maxDaysAgo: CREDIT_SUGGEST_MAX_DAYS_AGO,
    limit: 50,
  });
  if (refundedOrders.length === 0) return { queued: 0, skipped: 0 };

  const invoiceDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
  const invoiceQueue = parseFortnoxInvoiceQueue(invoiceDoc?.data);
  const invoiceByOrderId = new Map(
    invoiceQueue.filter((q) => q.status === "created" && q.fortnoxInvoiceNumber).map((q) => [q.orderId, q])
  );

  const creditDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY);
  const creditQueue = parseFortnoxCreditQueue(creditDoc?.data);
  const known = new Set(creditQueue.map((q) => q.refundId));

  const newItems: FortnoxCreditQueueItem[] = [];
  let skippedNoInvoice = 0;
  for (const order of refundedOrders) {
    const invoice = invoiceByOrderId.get(order.orderId);
    for (const refund of order.refunds) {
      if (known.has(refund.id)) continue;
      if (newItems.length >= MAX_CREDITS_QUEUED_PER_RUN) break;
      if (!invoice) {
        skippedNoInvoice += 1;
        continue;
      }
      newItems.push({
        id: refund.id,
        orderId: order.orderId,
        refundId: refund.id,
        orderName: order.orderName,
        invoiceReference: invoice.fortnoxInvoiceNumber!,
        lineItems: refund.lineItems.map((li) => ({ title: li.title, quantity: li.quantity, subtotal: li.subtotal })),
        status: "suggested",
        createdAt: new Date().toISOString(),
      });
    }
  }
  if (newItems.length === 0) return { queued: 0, skipped: skippedNoInvoice };

  const nextQueue = [...newItems, ...creditQueue].slice(0, MAX_CREDIT_QUEUE_STORED);
  await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY, nextQueue);
  return { queued: newItems.length, skipped: skippedNoInvoice };
}

/** Create the actual Fortnox credit invoice for one queued (approved) suggestion. */
export async function createQueuedFortnoxCreditInvoice(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  refundId: string;
  fortnoxAccessToken: string;
}): Promise<{ ok: true; creditInvoiceNumber: string } | { ok: false; error: string }> {
  const { supabaseAdmin, businessProfileId, refundId, fortnoxAccessToken } = deps;

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY);
  const queue = parseFortnoxCreditQueue(doc?.data);
  const item = queue.find((q) => q.refundId === refundId && (q.status === "suggested" || q.status === "failed"));
  if (!item) return { ok: false, error: "queue_item_not_found" };

  const result = await createFortnoxCreditInvoice(fortnoxAccessToken, {
    invoiceReference: item.invoiceReference,
    rows: item.lineItems.map((li) => ({ description: li.title, price: li.subtotal / li.quantity, quantity: li.quantity })),
  });

  if ("error" in result) {
    const errorMessage = result.error;
    const nextQueue = queue.map((q) => (q.refundId === refundId ? { ...q, status: "failed" as const, error: errorMessage } : q));
    await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY, nextQueue);
    return { ok: false, error: errorMessage };
  }

  const nextQueue = queue.map((q) =>
    q.refundId === refundId
      ? { ...q, status: "created" as const, creditInvoiceNumber: result.creditInvoiceNumber, error: undefined }
      : q
  );
  await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY, nextQueue);
  return { ok: true, creditInvoiceNumber: result.creditInvoiceNumber };
}

export async function dismissFortnoxCreditSuggestion(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  refundId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin, businessProfileId, refundId } = deps;
  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY);
  const queue = parseFortnoxCreditQueue(doc?.data);
  if (!queue.some((q) => q.refundId === refundId)) return { ok: false, error: "queue_item_not_found" };
  const nextQueue = queue.map((q) => (q.refundId === refundId ? { ...q, status: "dismissed" as const } : q));
  await saveProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY, nextQueue);
  return { ok: true };
}
