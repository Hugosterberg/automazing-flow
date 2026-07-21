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
