/**
 * Fortnox API provider (https://api.fortnox.se/3).
 *
 * Auth: Bearer access token from the OAuth flow (~1h). Refresh tokens are
 * valid 45 days and ROTATE on every refresh — callers must persist the new
 * pair via the tokenStore. Only read paths used by the Economy panel live
 * here: company information and an invoice summary (unpaid/overdue).
 */

const FORTNOX_API = "https://api.fortnox.se/3";
const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
const FETCH_TIMEOUT_MS = 12_000;

export type FortnoxCompanyInformation = {
  companyName: string;
  organizationNumber: string;
};

export type FortnoxInvoiceRow = {
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
};

export type FortnoxInvoiceSummary = {
  unpaidCount: number;
  unpaidSum: number;
  overdueCount: number;
  overdueSum: number;
  currency: string;
  /** Most urgent open invoices (overdue first, then by due date). */
  invoices: FortnoxInvoiceRow[];
};

async function fortnoxGet(path: string, accessToken: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${FORTNOX_API}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { __unauthorized: true };
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** POST/PUT helper that surfaces Fortnox's validation error text instead of swallowing it. */
async function fortnoxWrite(
  path: string,
  accessToken: string,
  body: unknown,
  method: "POST" | "PUT" = "POST"
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; unauthorized: boolean; error: string }> {
  try {
    const res = await fetch(`${FORTNOX_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) return { ok: false, unauthorized: true, error: "fortnox_unauthorized" };
    if (!res.ok) {
      const errInfo = data?.ErrorInformation as Record<string, unknown> | undefined;
      const message = String(errInfo?.message || errInfo?.Message || data?.message || `fortnox_error_${res.status}`);
      return { ok: false, unauthorized: false, error: message };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, unauthorized: false, error: e instanceof Error ? e.message : "fortnox_request_failed" };
  }
}

function isUnauthorized(payload: unknown): boolean {
  return Boolean((payload as { __unauthorized?: boolean } | null)?.__unauthorized);
}

export async function fetchFortnoxCompanyInformation(
  accessToken: string
): Promise<FortnoxCompanyInformation | null> {
  const payload = await fortnoxGet("/companyinformation", accessToken);
  if (!payload || isUnauthorized(payload)) return null;
  const info = (payload as { CompanyInformation?: Record<string, unknown> }).CompanyInformation;
  if (!info) return null;
  return {
    companyName: String(info.CompanyName || "").trim(),
    organizationNumber: String(info.OrganizationNumber || "").trim(),
  };
}

export function parseFortnoxInvoiceList(payload: unknown): FortnoxInvoiceRow[] {
  const rows = (payload as { Invoices?: unknown })?.Invoices;
  if (!Array.isArray(rows)) return [];
  const invoices: FortnoxInvoiceRow[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    invoices.push({
      invoiceNumber: String(raw?.DocumentNumber ?? raw?.InvoiceNumber ?? "").trim(),
      customerName: String(raw?.CustomerName || "").trim(),
      dueDate: String(raw?.DueDate || "").trim(),
      total: Number(raw?.Total) || 0,
      balance: Number(raw?.Balance) || 0,
      currency: String(raw?.Currency || "SEK").trim() || "SEK",
    });
  }
  return invoices;
}

/** Sum + rank open invoices; `today` as YYYY-MM-DD decides overdue. */
export function summarizeFortnoxInvoices(
  unpaid: FortnoxInvoiceRow[],
  today: string
): FortnoxInvoiceSummary {
  const overdue = unpaid.filter((row) => row.dueDate && row.dueDate < today);
  const sum = (rows: FortnoxInvoiceRow[]) =>
    Math.round(rows.reduce((acc, row) => acc + row.balance, 0) * 100) / 100;
  const ranked = [...unpaid].sort((a, b) => {
    const aOver = a.dueDate && a.dueDate < today ? 0 : 1;
    const bOver = b.dueDate && b.dueDate < today ? 0 : 1;
    return aOver - bOver || a.dueDate.localeCompare(b.dueDate);
  });
  return {
    unpaidCount: unpaid.length,
    unpaidSum: sum(unpaid),
    overdueCount: overdue.length,
    overdueSum: sum(overdue),
    currency: unpaid[0]?.currency || "SEK",
    invoices: ranked.slice(0, 8),
  };
}

export async function fetchFortnoxInvoiceSummary(
  accessToken: string,
  today: string
): Promise<{ ok: true; summary: FortnoxInvoiceSummary } | { ok: false; unauthorized: boolean }> {
  const payload = await fortnoxGet(
    "/invoices?filter=unpaid&limit=500&sortby=duedate&sortorder=ascending",
    accessToken
  );
  if (isUnauthorized(payload)) return { ok: false, unauthorized: true };
  if (!payload) return { ok: false, unauthorized: false };
  return { ok: true, summary: summarizeFortnoxInvoices(parseFortnoxInvoiceList(payload), today) };
}

export async function refreshFortnoxAccessToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number | null }
  | { ok: false; error: string }
> {
  try {
    const auth = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
    const res = await fetch(FORTNOX_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: options.refreshToken,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      return { ok: false, error: String(data.error_description || data.error || "refresh_failed") };
    }
    return {
      ok: true,
      accessToken: data.access_token,
      // Fortnox rotates refresh tokens; fall back to the old one defensively.
      refreshToken: data.refresh_token || options.refreshToken,
      expiresIn: Number.isFinite(data.expires_in) ? Number(data.expires_in) : null,
    };
  } catch {
    return { ok: false, error: "refresh_failed" };
  }
}

// ---------------------------------------------------------------------------
// Invoice creation (order → invoice queue approval flow).
//
// Fortnox invoices require a CustomerNumber pointing at an existing Customer
// resource — there is no "ad-hoc" invoice without one. Rather than trying to
// search Fortnox for a matching customer by email (their filter API doesn't
// support that reliably), the caller is expected to remember which Fortnox
// CustomerNumber it minted for a given Shopify customer (see
// `server/lib/fortnoxInvoiceJobs.ts`) and only create a new Customer the
// first time that email is billed.
// ---------------------------------------------------------------------------

export async function createFortnoxCustomer(
  accessToken: string,
  input: { name: string; email?: string }
): Promise<{ ok: true; customerNumber: string } | { ok: false; unauthorized: boolean; error: string }> {
  const result = await fortnoxWrite("/customers", accessToken, {
    Customer: {
      Name: input.name.slice(0, 100) || "Shopify customer",
      ...(input.email ? { Email: input.email.slice(0, 200) } : {}),
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  const customer = (result.data.Customer || {}) as Record<string, unknown>;
  const customerNumber = String(customer.CustomerNumber || "").trim();
  if (!customerNumber) {
    return { ok: false, unauthorized: false, error: "fortnox_customer_missing_number" };
  }
  return { ok: true, customerNumber };
}

export interface FortnoxInvoiceRowInput {
  description: string;
  /** Unit price, excluding VAT. */
  price: number;
  quantity: number;
}

export interface CreateFortnoxInvoiceInput {
  customerNumber: string;
  /** Shopify order name (e.g. "#1042") — stored on the invoice for traceability. */
  yourOrderNumber?: string;
  currency?: string;
  rows: FortnoxInvoiceRowInput[];
}

/**
 * Create a Fortnox invoice for a customer. Row prices are treated as
 * VAT-exclusive — verify this matches how the tenant's Fortnox account and
 * Shopify store handle tax before relying on this for bookkeeping, since
 * Shopify prices are commonly VAT-inclusive and this integration does not
 * attempt to back out tax automatically.
 */
export async function createFortnoxInvoice(
  accessToken: string,
  input: CreateFortnoxInvoiceInput
): Promise<{ ok: true; invoiceNumber: string } | { ok: false; unauthorized: boolean; error: string }> {
  if (!input.customerNumber) {
    return { ok: false, unauthorized: false, error: "missing_customer_number" };
  }
  if (input.rows.length === 0) {
    return { ok: false, unauthorized: false, error: "missing_invoice_rows" };
  }

  const result = await fortnoxWrite("/invoices", accessToken, {
    Invoice: {
      CustomerNumber: input.customerNumber,
      ...(input.yourOrderNumber ? { YourOrderNumber: input.yourOrderNumber.slice(0, 50) } : {}),
      ...(input.currency ? { Currency: input.currency.slice(0, 3) } : {}),
      InvoiceRows: input.rows.slice(0, 100).map((row) => ({
        Description: row.description.slice(0, 200),
        Price: Math.round(row.price * 100) / 100,
        DeliveredQuantity: row.quantity,
      })),
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  const invoice = (result.data.Invoice || {}) as Record<string, unknown>;
  const invoiceNumber = String(invoice.DocumentNumber || invoice.InvoiceNumber || "").trim();
  if (!invoiceNumber) {
    return { ok: false, unauthorized: false, error: "fortnox_invoice_missing_number" };
  }
  return { ok: true, invoiceNumber };
}
