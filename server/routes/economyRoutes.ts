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
  const { getSessionUserId, tokenStore, getStoredAccountAccess } = deps;

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
}
