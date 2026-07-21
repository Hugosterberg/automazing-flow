/**
 * Fortnox API provider (https://api.fortnox.se/3).
 *
 * Auth: Bearer access token from the OAuth flow (~1h). Refresh tokens are
 * valid 45 days and ROTATE on every refresh — callers must persist the new
 * pair via the tokenStore.
 *
 * Covers: company info, invoices (read/create/pay/credit), customers
 * (create), suppliers + supplier invoices (create), articles (read/create),
 * and a lightweight account-balance summary. Every write path here was
 * written against Fortnox's documented v3 API shape but has NOT been
 * exercised against a live Fortnox sandbox — verify each one (customer
 * match, invoice rows, payment registration, credit invoice, supplier
 * invoice) before relying on it for real bookkeeping.
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
  /** Existing Fortnox ArticleNumber, when the row was matched/created via the article register. */
  articleNumber?: string;
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
        ...(row.articleNumber ? { ArticleNumber: row.articleNumber } : {}),
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

// ---------------------------------------------------------------------------
// Full invoice history (read) — browsing/search, not just the unpaid summary.
// ---------------------------------------------------------------------------

export type FortnoxInvoiceStatusFilter = "all" | "unpaid" | "paid" | "cancelled";

/**
 * Search/browse invoices beyond the unpaid summary. `query` matches against
 * customer name and document/invoice number (Fortnox's own `lastmodified`
 * free-text search isn't reliable across accounts, so filtering by name/number
 * is done client-side over the fetched page).
 */
export async function fetchFortnoxInvoiceHistory(
  accessToken: string,
  options: { status?: FortnoxInvoiceStatusFilter; query?: string; limit?: number } = {}
): Promise<{ ok: true; invoices: FortnoxInvoiceRow[] } | { ok: false; unauthorized: boolean }> {
  const filterParam =
    options.status === "unpaid"
      ? "&filter=unpaid"
      : options.status === "paid"
        ? "&filter=fullypaid"
        : options.status === "cancelled"
          ? "&filter=cancelled"
          : "";
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const payload = await fortnoxGet(
    `/invoices?limit=${limit}&sortby=invoicedate&sortorder=descending${filterParam}`,
    accessToken
  );
  if (isUnauthorized(payload)) return { ok: false, unauthorized: true };
  if (!payload) return { ok: false, unauthorized: false };
  let invoices = parseFortnoxInvoiceList(payload);
  const query = String(options.query || "").trim().toLowerCase();
  if (query) {
    invoices = invoices.filter(
      (inv) =>
        inv.customerName.toLowerCase().includes(query) || inv.invoiceNumber.toLowerCase().includes(query)
    );
  }
  return { ok: true, invoices };
}

// ---------------------------------------------------------------------------
// Payment registration (write) — closes the loop once an invoice is paid.
// ---------------------------------------------------------------------------

/**
 * Register a payment against an existing invoice via Fortnox's
 * InvoicePayments resource. `accountNumber` is the "mode of payment" account
 * (BAS chart bank/cash account, e.g. 1930) — defaults to 1930 (bankkonto)
 * when not given, which is the common case for card/Shopify-settled payments
 * but should be verified per tenant's chart of accounts.
 */
export async function recordFortnoxInvoicePayment(
  accessToken: string,
  input: { invoiceNumber: string; amount: number; paymentDate: string; accountNumber?: number }
): Promise<{ ok: true } | { ok: false; unauthorized: boolean; error: string }> {
  if (!input.invoiceNumber) return { ok: false, unauthorized: false, error: "missing_invoice_number" };
  if (!(input.amount > 0)) return { ok: false, unauthorized: false, error: "missing_amount" };

  const result = await fortnoxWrite("/invoicepayments", accessToken, {
    InvoicePayment: {
      InvoiceNumber: input.invoiceNumber,
      Amount: Math.round(input.amount * 100) / 100,
      PaymentDate: input.paymentDate,
      ModeOfPaymentAccount: input.accountNumber ?? 1930,
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Credit invoices (write) — for Shopify refunds against an already-booked
// Fortnox invoice.
// ---------------------------------------------------------------------------

export interface CreateFortnoxCreditInvoiceInput {
  /** DocumentNumber of the original Fortnox invoice being credited. */
  invoiceReference: string;
  rows: FortnoxInvoiceRowInput[];
}

/**
 * Create a credit invoice referencing an existing invoice. Row prices follow
 * the same VAT-exclusive convention as `createFortnoxInvoice` — verify
 * against the original invoice's rows before relying on this.
 */
export async function createFortnoxCreditInvoice(
  accessToken: string,
  input: CreateFortnoxCreditInvoiceInput
): Promise<{ ok: true; creditInvoiceNumber: string } | { ok: false; unauthorized: boolean; error: string }> {
  if (!input.invoiceReference) {
    return { ok: false, unauthorized: false, error: "missing_invoice_reference" };
  }
  if (input.rows.length === 0) {
    return { ok: false, unauthorized: false, error: "missing_credit_rows" };
  }

  const result = await fortnoxWrite("/creditinvoices", accessToken, {
    CreditInvoice: {
      InvoiceReference: input.invoiceReference,
      InvoiceRows: input.rows.slice(0, 100).map((row) => ({
        Description: row.description.slice(0, 200),
        Price: Math.round(row.price * 100) / 100,
        DeliveredQuantity: row.quantity,
      })),
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  const credit = (result.data.CreditInvoice || {}) as Record<string, unknown>;
  const creditInvoiceNumber = String(credit.DocumentNumber || credit.InvoiceNumber || "").trim();
  if (!creditInvoiceNumber) {
    return { ok: false, unauthorized: false, error: "fortnox_credit_invoice_missing_number" };
  }
  return { ok: true, creditInvoiceNumber };
}

// ---------------------------------------------------------------------------
// Suppliers + supplier invoices (write + read) — the cost/accounts-payable
// side, distinct from the customer invoices above.
// ---------------------------------------------------------------------------

export async function createFortnoxSupplier(
  accessToken: string,
  input: { name: string; organisationNumber?: string }
): Promise<{ ok: true; supplierNumber: string } | { ok: false; unauthorized: boolean; error: string }> {
  const result = await fortnoxWrite("/suppliers", accessToken, {
    Supplier: {
      Name: input.name.slice(0, 100) || "Supplier",
      ...(input.organisationNumber ? { OrganisationNumber: input.organisationNumber.slice(0, 20) } : {}),
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  const supplier = (result.data.Supplier || {}) as Record<string, unknown>;
  const supplierNumber = String(supplier.SupplierNumber || "").trim();
  if (!supplierNumber) {
    return { ok: false, unauthorized: false, error: "fortnox_supplier_missing_number" };
  }
  return { ok: true, supplierNumber };
}

export interface CreateFortnoxSupplierInvoiceInput {
  supplierNumber: string;
  /** The supplier's own invoice/reference number (printed on their invoice). */
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  currency?: string;
}

export async function createFortnoxSupplierInvoice(
  accessToken: string,
  input: CreateFortnoxSupplierInvoiceInput
): Promise<{ ok: true; givenNumber: string } | { ok: false; unauthorized: boolean; error: string }> {
  if (!input.supplierNumber) return { ok: false, unauthorized: false, error: "missing_supplier_number" };
  if (!(input.total > 0)) return { ok: false, unauthorized: false, error: "missing_total" };

  const result = await fortnoxWrite("/supplierinvoices", accessToken, {
    SupplierInvoice: {
      SupplierNumber: input.supplierNumber,
      InvoiceNumber: input.invoiceNumber.slice(0, 50),
      InvoiceDate: input.invoiceDate,
      DueDate: input.dueDate,
      Total: Math.round(input.total * 100) / 100,
      ...(input.currency ? { Currency: input.currency.slice(0, 3) } : {}),
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  const invoice = (result.data.SupplierInvoice || {}) as Record<string, unknown>;
  const givenNumber = String(invoice.GivenNumber || invoice.InvoiceNumber || "").trim();
  if (!givenNumber) {
    return { ok: false, unauthorized: false, error: "fortnox_supplier_invoice_missing_number" };
  }
  return { ok: true, givenNumber };
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

export function parseFortnoxSupplierInvoiceList(payload: unknown): FortnoxSupplierInvoiceRow[] {
  const rows = (payload as { SupplierInvoices?: unknown })?.SupplierInvoices;
  if (!Array.isArray(rows)) return [];
  const invoices: FortnoxSupplierInvoiceRow[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    invoices.push({
      givenNumber: String(raw?.GivenNumber ?? "").trim(),
      supplierName: String(raw?.SupplierName || "").trim(),
      invoiceNumber: String(raw?.InvoiceNumber || "").trim(),
      dueDate: String(raw?.DueDate || "").trim(),
      total: Number(raw?.Total) || 0,
      balance: Number(raw?.Balance) || 0,
      currency: String(raw?.Currency || "SEK").trim() || "SEK",
    });
  }
  return invoices;
}

/** Accounts-payable overview: unpaid/overdue supplier invoices (money we owe). */
export async function fetchFortnoxSupplierInvoiceSummary(
  accessToken: string,
  today: string
): Promise<{ ok: true; summary: FortnoxSupplierInvoiceSummary } | { ok: false; unauthorized: boolean }> {
  const payload = await fortnoxGet(
    "/supplierinvoices?filter=unpaid&limit=500&sortby=duedate&sortorder=ascending",
    accessToken
  );
  if (isUnauthorized(payload)) return { ok: false, unauthorized: true };
  if (!payload) return { ok: false, unauthorized: false };
  const unpaid = parseFortnoxSupplierInvoiceList(payload);
  const overdue = unpaid.filter((row) => row.dueDate && row.dueDate < today);
  const sum = (rows: FortnoxSupplierInvoiceRow[]) =>
    Math.round(rows.reduce((acc, row) => acc + row.balance, 0) * 100) / 100;
  return {
    ok: true,
    summary: {
      unpaidCount: unpaid.length,
      unpaidSum: sum(unpaid),
      overdueCount: overdue.length,
      overdueSum: sum(overdue),
      currency: unpaid[0]?.currency || "SEK",
      invoices: unpaid.slice(0, 8),
    },
  };
}

// ---------------------------------------------------------------------------
// Articles (read + write) — Fortnox's product/article register, used so
// invoice rows can reference a real ArticleNumber instead of freeform text.
// ---------------------------------------------------------------------------

export type FortnoxArticle = {
  articleNumber: string;
  description: string;
  salesPrice: number;
};

export function parseFortnoxArticleList(payload: unknown): FortnoxArticle[] {
  const rows = (payload as { Articles?: unknown })?.Articles;
  if (!Array.isArray(rows)) return [];
  return (rows as Array<Record<string, unknown>>).map((raw) => ({
    articleNumber: String(raw?.ArticleNumber || "").trim(),
    description: String(raw?.Description || "").trim(),
    salesPrice: Number(raw?.SalesPrice) || 0,
  }));
}

export async function fetchFortnoxArticles(
  accessToken: string,
  limit = 200
): Promise<{ ok: true; articles: FortnoxArticle[] } | { ok: false; unauthorized: boolean }> {
  const payload = await fortnoxGet(`/articles?limit=${Math.min(500, Math.max(1, limit))}`, accessToken);
  if (isUnauthorized(payload)) return { ok: false, unauthorized: true };
  if (!payload) return { ok: false, unauthorized: false };
  return { ok: true, articles: parseFortnoxArticleList(payload) };
}

export async function createFortnoxArticle(
  accessToken: string,
  input: { description: string; salesPrice?: number }
): Promise<{ ok: true; articleNumber: string } | { ok: false; unauthorized: boolean; error: string }> {
  const result = await fortnoxWrite("/articles", accessToken, {
    Article: {
      Description: input.description.slice(0, 200) || "Product",
      ...(input.salesPrice != null ? { SalesPrice: Math.round(input.salesPrice * 100) / 100 } : {}),
    },
  });
  if ("error" in result) return { ok: false, unauthorized: result.unauthorized, error: result.error };
  const article = (result.data.Article || {}) as Record<string, unknown>;
  const articleNumber = String(article.ArticleNumber || "").trim();
  if (!articleNumber) {
    return { ok: false, unauthorized: false, error: "fortnox_article_missing_number" };
  }
  return { ok: true, articleNumber };
}

// ---------------------------------------------------------------------------
// Account balances (read) — a lightweight, approximate P&L/balance snapshot
// built from the BAS chart-of-accounts balances, not Fortnox's own report
// endpoints (which need more account-plan-specific handling than is safe to
// assume here). Bucketed by BAS account class; verify signs/totals against
// Fortnox's own reports before treating this as authoritative.
// ---------------------------------------------------------------------------

export type FortnoxFinancialSnapshot = {
  currency: string;
  /** BAS class 3xxx, absolute sum. */
  revenue: number;
  /** BAS classes 4xxx-8xxx, absolute sum. */
  costs: number;
  /** Approximate result (revenue - costs) for the current financial year to date. */
  resultEstimate: number;
  /** BAS class 1xxx, absolute sum. */
  assets: number;
  /** BAS classes 2xxx, absolute sum (equity + liabilities). */
  equityAndLiabilities: number;
};

function basClassSum(accounts: Array<{ number: number; balance: number }>, min: number, max: number): number {
  return Math.round(
    accounts
      .filter((a) => a.number >= min && a.number <= max)
      .reduce((sum, a) => sum + Math.abs(a.balance), 0) * 100
  ) / 100;
}

export function summarizeFortnoxFinancials(payload: unknown, currency = "SEK"): FortnoxFinancialSnapshot {
  const rows = (payload as { Accounts?: unknown })?.Accounts;
  const accounts = (Array.isArray(rows) ? rows : [])
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      return { number: Number(r?.Number) || 0, balance: Number(r?.Balance) || 0 };
    })
    .filter((a) => a.number > 0);

  const revenue = basClassSum(accounts, 3000, 3999);
  const costs = basClassSum(accounts, 4000, 8999);
  return {
    currency,
    revenue,
    costs,
    resultEstimate: Math.round((revenue - costs) * 100) / 100,
    assets: basClassSum(accounts, 1000, 1999),
    equityAndLiabilities: basClassSum(accounts, 2000, 2999),
  };
}

/** Approximate current-financial-year P&L/balance snapshot from account balances. */
export async function fetchFortnoxFinancialSnapshot(
  accessToken: string
): Promise<{ ok: true; snapshot: FortnoxFinancialSnapshot } | { ok: false; unauthorized: boolean }> {
  const payload = await fortnoxGet("/accounts?limit=500", accessToken);
  if (isUnauthorized(payload)) return { ok: false, unauthorized: true };
  if (!payload) return { ok: false, unauthorized: false };
  return { ok: true, snapshot: summarizeFortnoxFinancials(payload) };
}
