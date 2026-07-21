/**
 * Economy routes — Fortnox summary for the Company → Ekonomi tab and the
 * Daily Brief invoice signal.
 *
 * GET /api/economy/fortnox?business_profile_id= →
 *   { connected: false }                     when no Fortnox account
 *   { connected: true, companyName, summary } with unpaid/overdue invoices
 *
 * Access tokens (~1h) refresh transparently; Fortnox rotates refresh tokens,
 * so the new pair is persisted on every refresh. Summaries are cached
 * in-memory for 10 minutes per account to keep the brief cheap.
 */

import {
  fetchFortnoxInvoiceSummary,
  fetchFortnoxInvoiceHistory,
  fetchFortnoxSupplierInvoiceSummary,
  fetchFortnoxArticles,
  fetchFortnoxFinancialSnapshot,
  createFortnoxSupplier,
  createFortnoxSupplierInvoice,
  type FortnoxInvoiceSummary,
  type FortnoxInvoiceStatusFilter,
} from "../providers/fortnox.ts";
import { getFreshFortnoxAccessToken } from "../lib/fortnoxAuth.ts";
import { accountInBusinessProfile, readRequestBusinessProfileId } from "../lib/profileScope.ts";
import {
  createQueuedFortnoxInvoice,
  dismissFortnoxInvoiceSuggestion,
  parseFortnoxInvoiceQueue,
  createQueuedFortnoxCreditInvoice,
  dismissFortnoxCreditSuggestion,
  parseFortnoxCreditQueue,
  FORTNOX_INVOICE_QUEUE_DOC_KEY,
  FORTNOX_CREDIT_QUEUE_DOC_KEY,
} from "../lib/fortnoxInvoiceJobs.ts";
import { loadProfileDocument } from "../lib/profileDocumentStore.ts";
import type { SupabaseAdminLike } from "../lib/supabaseAdminLike.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  companyName?: string;
};

interface EconomyRoutesDeps {
  getSessionUserId: (req: unknown) => string | null;
  tokenStore: {
    get: (accountId: string) => Promise<StoredAccount | null | undefined>;
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
    entries: () => Promise<Array<[string, StoredAccount]>>;
  };
  getStoredAccountAccess: (
    stored: StoredAccount | null | undefined,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
  supabaseAdmin: SupabaseAdminLike | null;
}

const SUMMARY_TTL_MS = 10 * 60 * 1000;
const summaryCache = new Map<string, { summary: FortnoxInvoiceSummary; expiresAt: number }>();

function todayIsoStockholm(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

export function registerEconomyRoutes(app, deps: EconomyRoutesDeps) {
  const { getSessionUserId, tokenStore, getStoredAccountAccess, supabaseAdmin } = deps;

  /** Locate the tenant's connected Fortnox account (if any), migrating legacy rows as needed. */
  async function findFortnoxAccount(
    businessProfileId: string,
    userId: string
  ): Promise<{ accountId: string; stored: StoredAccount } | null> {
    for (const [id, raw] of await tokenStore.entries()) {
      if (String(raw?.platform || "") !== "fortnox") continue;
      const access = getStoredAccountAccess(raw, userId);
      if (!access.allowed) continue;
      if (!accountInBusinessProfile(raw, businessProfileId)) continue;
      if (access.migrate) {
        await tokenStore.set(id, { ...raw, ownerUserId: userId });
      }
      return { accountId: id, stored: raw };
    }
    return null;
  }

  async function freshAccessToken(accountId: string, stored: StoredAccount): Promise<string | null> {
    return getFreshFortnoxAccessToken(tokenStore, accountId, stored);
  }

  app.get("/api/economy/fortnox", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    let accountId: string | null = null;
    let stored: StoredAccount | null = null;
    for (const [id, raw] of await tokenStore.entries()) {
      if (String(raw?.platform || "") !== "fortnox") continue;
      const access = getStoredAccountAccess(raw, userId);
      if (!access.allowed) continue;
      if (!accountInBusinessProfile(raw, businessProfileId)) continue;
      if (access.migrate) {
        await tokenStore.set(id, { ...raw, ownerUserId: userId });
      }
      accountId = id;
      stored = raw;
      break;
    }

    if (!accountId || !stored) {
      return res.json({ connected: false });
    }

    const cached = summaryCache.get(accountId);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({
        connected: true,
        companyName: String(stored.companyName || "Fortnox"),
        summary: cached.summary,
      });
    }

    const accessToken = await freshAccessToken(accountId, stored);
    if (!accessToken) {
      return res.json({
        connected: true,
        companyName: String(stored.companyName || "Fortnox"),
        error: "fortnox_token_expired",
      });
    }

    const result = await fetchFortnoxInvoiceSummary(accessToken, todayIsoStockholm());
    if (result.ok === false) {
      return res.json({
        connected: true,
        companyName: String(stored.companyName || "Fortnox"),
        error: result.unauthorized ? "fortnox_token_expired" : "fortnox_fetch_failed",
      });
    }

    summaryCache.set(accountId, { summary: result.summary, expiresAt: Date.now() + SUMMARY_TTL_MS });
    return res.json({
      connected: true,
      companyName: String(stored.companyName || "Fortnox"),
      summary: result.summary,
    });
  });

  // Fortnox invoice suggestion queue (paid + fulfilled Shopify orders not yet
  // billed — populated by the fortnox-invoice-suggest cron, never auto-created).
  app.get("/api/economy/fortnox/invoice-queue", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.json({ queue: [] });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    try {
      const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
      const queue = parseFortnoxInvoiceQueue(doc?.data).filter(
        (item) => item.status === "suggested" || item.status === "failed"
      );
      return res.json({ queue });
    } catch (e) {
      console.error("[economy] invoice-queue list failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "invoice_queue_load_failed" });
    }
  });

  app.post("/api/economy/fortnox/invoice-queue/create", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const orderId = String(req.body?.orderId || "").trim();
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });
    if (!orderId) return res.status(400).json({ error: "missing_order_id" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.status(404).json({ error: "fortnox_not_connected" });

    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.status(409).json({ error: "fortnox_token_expired" });

    try {
      const result = await createQueuedFortnoxInvoice({
        supabaseAdmin,
        businessProfileId,
        orderId,
        fortnoxAccessToken: accessToken,
      });
      if ("error" in result) return res.status(400).json({ error: result.error });
      return res.json({ ok: true, invoiceNumber: result.invoiceNumber });
    } catch (e) {
      console.error("[economy] invoice-queue create failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "invoice_create_failed" });
    }
  });

  app.post("/api/economy/fortnox/invoice-queue/dismiss", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const orderId = String(req.body?.orderId || "").trim();
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });
    if (!orderId) return res.status(400).json({ error: "missing_order_id" });

    try {
      const result = await dismissFortnoxInvoiceSuggestion({ supabaseAdmin, businessProfileId, orderId });
      if ("error" in result) return res.status(400).json({ error: result.error });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[economy] invoice-queue dismiss failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "invoice_dismiss_failed" });
    }
  });

  // Credit-invoice suggestion queue (Shopify refunds on orders we already
  // billed in Fortnox — populated by the fortnox-refund-credit-suggest cron).
  app.get("/api/economy/fortnox/credit-queue", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.json({ queue: [] });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    try {
      const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY);
      const queue = parseFortnoxCreditQueue(doc?.data).filter(
        (item) => item.status === "suggested" || item.status === "failed"
      );
      return res.json({ queue });
    } catch (e) {
      console.error("[economy] credit-queue list failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "credit_queue_load_failed" });
    }
  });

  app.post("/api/economy/fortnox/credit-queue/create", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const refundId = String(req.body?.refundId || "").trim();
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });
    if (!refundId) return res.status(400).json({ error: "missing_refund_id" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.status(404).json({ error: "fortnox_not_connected" });
    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.status(409).json({ error: "fortnox_token_expired" });

    try {
      const result = await createQueuedFortnoxCreditInvoice({
        supabaseAdmin,
        businessProfileId,
        refundId,
        fortnoxAccessToken: accessToken,
      });
      if ("error" in result) return res.status(400).json({ error: result.error });
      return res.json({ ok: true, creditInvoiceNumber: result.creditInvoiceNumber });
    } catch (e) {
      console.error("[economy] credit-queue create failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "credit_invoice_create_failed" });
    }
  });

  app.post("/api/economy/fortnox/credit-queue/dismiss", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const refundId = String(req.body?.refundId || "").trim();
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });
    if (!refundId) return res.status(400).json({ error: "missing_refund_id" });

    try {
      const result = await dismissFortnoxCreditSuggestion({ supabaseAdmin, businessProfileId, refundId });
      if ("error" in result) return res.status(400).json({ error: result.error });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[economy] credit-queue dismiss failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "credit_invoice_dismiss_failed" });
    }
  });

  // Full invoice history + search (beyond the unpaid/overdue summary).
  app.get("/api/economy/fortnox/invoices", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.json({ connected: false });
    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.json({ connected: true, error: "fortnox_token_expired" });

    const statusRaw = String(req.query?.status || "all");
    const status: FortnoxInvoiceStatusFilter = ["all", "unpaid", "paid", "cancelled"].includes(statusRaw)
      ? (statusRaw as FortnoxInvoiceStatusFilter)
      : "all";
    const query = String(req.query?.q || "").trim();

    const result = await fetchFortnoxInvoiceHistory(accessToken, { status, query, limit: 200 });
    if (result.ok === false) {
      return res.json({ connected: true, error: result.unauthorized ? "fortnox_token_expired" : "fortnox_fetch_failed" });
    }
    return res.json({ connected: true, invoices: result.invoices });
  });

  // Approximate P&L/balance snapshot from account balances (see the caveat on
  // `summarizeFortnoxFinancials` in the provider).
  app.get("/api/economy/fortnox/financial-snapshot", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.json({ connected: false });
    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.json({ connected: true, error: "fortnox_token_expired" });

    const result = await fetchFortnoxFinancialSnapshot(accessToken);
    if (result.ok === false) {
      return res.json({ connected: true, error: result.unauthorized ? "fortnox_token_expired" : "fortnox_fetch_failed" });
    }
    return res.json({ connected: true, snapshot: result.snapshot });
  });

  // Accounts-payable overview (money we owe suppliers).
  app.get("/api/economy/fortnox/supplier-invoices", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.json({ connected: false });
    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.json({ connected: true, error: "fortnox_token_expired" });

    const result = await fetchFortnoxSupplierInvoiceSummary(accessToken, todayIsoStockholm());
    if (result.ok === false) {
      return res.json({ connected: true, error: result.unauthorized ? "fortnox_token_expired" : "fortnox_fetch_failed" });
    }
    return res.json({ connected: true, summary: result.summary });
  });

  // Create a supplier invoice — always an explicit, user-entered action (no
  // automated source of "what we owe a supplier" exists yet).
  app.post("/api/economy/fortnox/supplier-invoices", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const supplierName = String(body.supplierName || "").trim();
    const invoiceNumber = String(body.invoiceNumber || "").trim();
    const invoiceDate = String(body.invoiceDate || "").trim();
    const dueDate = String(body.dueDate || "").trim();
    const total = Number(body.total);
    if (!supplierName) return res.status(400).json({ error: "missing_supplier_name" });
    if (!invoiceNumber) return res.status(400).json({ error: "missing_invoice_number" });
    if (!invoiceDate || !dueDate) return res.status(400).json({ error: "missing_dates" });
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: "invalid_total" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.status(404).json({ error: "fortnox_not_connected" });
    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.status(409).json({ error: "fortnox_token_expired" });

    try {
      const supplier = await createFortnoxSupplier(accessToken, { name: supplierName });
      if ("error" in supplier) return res.status(400).json({ error: supplier.error });

      const invoice = await createFortnoxSupplierInvoice(accessToken, {
        supplierNumber: supplier.supplierNumber,
        invoiceNumber,
        invoiceDate,
        dueDate,
        total,
        currency: typeof body.currency === "string" ? body.currency : undefined,
      });
      if ("error" in invoice) return res.status(400).json({ error: invoice.error });
      return res.json({ ok: true, givenNumber: invoice.givenNumber });
    } catch (e) {
      console.error("[economy] supplier-invoice create failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "supplier_invoice_create_failed" });
    }
  });

  // Fortnox article register (read-only browse; articles are otherwise
  // created implicitly when an invoice row needs one — see fortnoxInvoiceJobs.ts).
  app.get("/api/economy/fortnox/articles", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) return res.status(400).json({ error: "business_profile_id is required" });

    const account = await findFortnoxAccount(businessProfileId, userId);
    if (!account) return res.json({ connected: false });
    const accessToken = await freshAccessToken(account.accountId, account.stored);
    if (!accessToken) return res.json({ connected: true, error: "fortnox_token_expired" });

    const result = await fetchFortnoxArticles(accessToken, 200);
    if (result.ok === false) {
      return res.json({ connected: true, error: result.unauthorized ? "fortnox_token_expired" : "fortnox_fetch_failed" });
    }
    return res.json({ connected: true, articles: result.articles });
  });
}
