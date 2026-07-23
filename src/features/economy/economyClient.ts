import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export type FortnoxInvoiceRow = {
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
};

export type FortnoxSummary = {
  unpaidCount: number;
  unpaidSum: number;
  overdueCount: number;
  overdueSum: number;
  currency: string;
  invoices: FortnoxInvoiceRow[];
};

export type FortnoxOverview =
  | { connected: false }
  | { connected: true; companyName: string; summary?: FortnoxSummary; error?: string };

export async function fetchFortnoxOverview(
  businessProfileId: string,
  signal?: AbortSignal
): Promise<FortnoxOverview> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/economy/fortnox?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include", signal }
  );
  if (!res.ok) return { connected: false };
  const body = (await res.json().catch(() => null)) as FortnoxOverview | null;
  if (!body || typeof body.connected !== "boolean") return { connected: false };
  return body;
}

export type FortnoxInvoiceQueueItem = {
  id: string;
  orderId: string;
  orderName: string;
  customerEmail: string;
  customerName: string | null;
  total: number;
  currency: string;
  lineItems: Array<{ title: string; quantity: number; price: number }>;
  status: "suggested" | "created" | "dismissed" | "failed";
  fortnoxInvoiceNumber?: string;
  error?: string;
  createdAt: string;
};

/**
 * Paid + fulfilled Shopify orders not yet billed in Fortnox — a suggestion
 * queue, never auto-created. See `fortnox-invoice-suggest` cron.
 */
export async function fetchFortnoxInvoiceQueue(
  businessProfileId: string,
  signal?: AbortSignal
): Promise<FortnoxInvoiceQueueItem[]> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/economy/fortnox/invoice-queue?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include", signal }
  );
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { queue?: FortnoxInvoiceQueueItem[] } | null;
  return Array.isArray(body?.queue) ? body.queue : [];
}

export async function createFortnoxInvoiceFromOrder(
  businessProfileId: string,
  orderId: string
): Promise<{ ok: boolean; invoiceNumber?: string; error?: string }> {
  const res = await fetchWithTimeout(apiUrl("/api/economy/fortnox/invoice-queue/create"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, orderId }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; invoiceNumber?: string; error?: string };
  if (!res.ok || !body.ok) return { ok: false, error: body.error || `http_${res.status}` };
  return { ok: true, invoiceNumber: body.invoiceNumber };
}

export async function dismissFortnoxInvoiceSuggestion(
  businessProfileId: string,
  orderId: string
): Promise<{ ok: boolean }> {
  const res = await fetchWithTimeout(apiUrl("/api/economy/fortnox/invoice-queue/dismiss"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, orderId }),
  });
  return { ok: res.ok };
}

export type FortnoxCreditQueueItem = {
  id: string;
  orderId: string;
  refundId: string;
  orderName: string;
  invoiceReference: string;
  lineItems: Array<{ title: string; quantity: number; subtotal: number }>;
  status: "suggested" | "created" | "dismissed" | "failed";
  creditInvoiceNumber?: string;
  error?: string;
  createdAt: string;
};

/** Shopify refunds on orders already billed in Fortnox — see `fortnox-refund-credit-suggest` cron. */
export async function fetchFortnoxCreditQueue(
  businessProfileId: string,
  signal?: AbortSignal
): Promise<FortnoxCreditQueueItem[]> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/economy/fortnox/credit-queue?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include", signal }
  );
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { queue?: FortnoxCreditQueueItem[] } | null;
  return Array.isArray(body?.queue) ? body.queue : [];
}

export async function createFortnoxCreditInvoiceFromRefund(
  businessProfileId: string,
  refundId: string
): Promise<{ ok: boolean; creditInvoiceNumber?: string; error?: string }> {
  const res = await fetchWithTimeout(apiUrl("/api/economy/fortnox/credit-queue/create"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, refundId }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; creditInvoiceNumber?: string; error?: string };
  if (!res.ok || !body.ok) return { ok: false, error: body.error || `http_${res.status}` };
  return { ok: true, creditInvoiceNumber: body.creditInvoiceNumber };
}

export async function dismissFortnoxCreditSuggestion(
  businessProfileId: string,
  refundId: string
): Promise<{ ok: boolean }> {
  const res = await fetchWithTimeout(apiUrl("/api/economy/fortnox/credit-queue/dismiss"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, refundId }),
  });
  return { ok: res.ok };
}

/** Full invoice history + search, beyond the unpaid/overdue summary. */
export async function fetchFortnoxInvoiceHistory(
  businessProfileId: string,
  options: { status?: "all" | "unpaid" | "paid" | "cancelled"; query?: string } = {},
  signal?: AbortSignal
): Promise<{ connected: boolean; invoices: FortnoxInvoiceRow[]; error?: string }> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  if (options.status) params.set("status", options.status);
  if (options.query) params.set("q", options.query);
  const res = await fetchWithTimeout(apiUrl(`/api/economy/fortnox/invoices?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  if (!res.ok) return { connected: false, invoices: [] };
  const body = (await res.json().catch(() => ({}))) as {
    connected?: boolean;
    invoices?: FortnoxInvoiceRow[];
    error?: string;
  };
  return { connected: Boolean(body.connected), invoices: Array.isArray(body.invoices) ? body.invoices : [], error: body.error };
}

export type FortnoxFinancialSnapshot = {
  currency: string;
  revenue: number;
  costs: number;
  resultEstimate: number;
  assets: number;
  equityAndLiabilities: number;
};

export async function fetchFortnoxFinancialSnapshot(
  businessProfileId: string,
  signal?: AbortSignal
): Promise<{ connected: boolean; snapshot?: FortnoxFinancialSnapshot; error?: string }> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/economy/fortnox/financial-snapshot?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include", signal }
  );
  if (!res.ok) return { connected: false };
  const body = (await res.json().catch(() => ({}))) as {
    connected?: boolean;
    snapshot?: FortnoxFinancialSnapshot;
    error?: string;
  };
  return { connected: Boolean(body.connected), snapshot: body.snapshot, error: body.error };
}

export type FortnoxSupplierInvoiceRow = {
  givenNumber: string;
  supplierName: string;
  invoiceNumber: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
};

export type FortnoxSupplierInvoiceSummary = {
  unpaidCount: number;
  unpaidSum: number;
  overdueCount: number;
  overdueSum: number;
  currency: string;
  invoices: FortnoxSupplierInvoiceRow[];
};

export async function fetchFortnoxSupplierInvoices(
  businessProfileId: string,
  signal?: AbortSignal
): Promise<{ connected: boolean; summary?: FortnoxSupplierInvoiceSummary; error?: string }> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/economy/fortnox/supplier-invoices?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include", signal }
  );
  if (!res.ok) return { connected: false };
  const body = (await res.json().catch(() => ({}))) as {
    connected?: boolean;
    summary?: FortnoxSupplierInvoiceSummary;
    error?: string;
  };
  return { connected: Boolean(body.connected), summary: body.summary, error: body.error };
}

export async function createFortnoxSupplierInvoice(
  businessProfileId: string,
  input: { supplierName: string; invoiceNumber: string; invoiceDate: string; dueDate: string; total: number; currency?: string }
): Promise<{ ok: boolean; givenNumber?: string; error?: string }> {
  const res = await fetchWithTimeout(apiUrl("/api/economy/fortnox/supplier-invoices"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, ...input }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; givenNumber?: string; error?: string };
  if (!res.ok || !body.ok) return { ok: false, error: body.error || `http_${res.status}` };
  return { ok: true, givenNumber: body.givenNumber };
}

export type FortnoxArticle = { articleNumber: string; description: string; salesPrice: number };

export async function fetchFortnoxArticles(
  businessProfileId: string,
  signal?: AbortSignal
): Promise<{ connected: boolean; articles: FortnoxArticle[]; error?: string }> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/economy/fortnox/articles?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include", signal }
  );
  if (!res.ok) return { connected: false, articles: [] };
  const body = (await res.json().catch(() => ({}))) as {
    connected?: boolean;
    articles?: FortnoxArticle[];
    error?: string;
  };
  return { connected: Boolean(body.connected), articles: Array.isArray(body.articles) ? body.articles : [], error: body.error };
}
