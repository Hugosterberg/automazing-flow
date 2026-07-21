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
  refreshFortnoxAccessToken,
  type FortnoxInvoiceSummary,
} from "../providers/fortnox.ts";
import { accountInBusinessProfile, readRequestBusinessProfileId } from "../lib/profileScope.ts";
import {
  createQueuedFortnoxInvoice,
  dismissFortnoxInvoiceSuggestion,
  parseFortnoxInvoiceQueue,
  FORTNOX_INVOICE_QUEUE_DOC_KEY,
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

function tokenFreshEnough(stored: StoredAccount): boolean {
  const raw = String(stored.expiresAt || "").trim();
  if (!raw) return true;
  const expiresAt = new Date(raw).getTime();
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000;
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

  async function freshAccessToken(
    accountId: string,
    stored: StoredAccount
  ): Promise<string | null> {
    if (stored.accessToken && tokenFreshEnough(stored)) return String(stored.accessToken);
    const clientId = String(process.env.FORTNOX_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.FORTNOX_CLIENT_SECRET || "").trim();
    const refreshToken = String(stored.refreshToken || "").trim();
    if (!clientId || !clientSecret || !refreshToken) {
      return stored.accessToken ? String(stored.accessToken) : null;
    }
    const refreshed = await refreshFortnoxAccessToken({ clientId, clientSecret, refreshToken });
    if (!refreshed.ok) return stored.accessToken ? String(stored.accessToken) : null;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
        : stored.expiresAt,
    });
    return refreshed.accessToken;
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
}
