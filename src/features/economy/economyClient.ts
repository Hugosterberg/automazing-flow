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
