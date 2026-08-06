/**
 * GET /api/marketing/campaigns — active ad campaigns across the user's
 * connected `meta_business` and `google_ads` accounts, with trailing-7-day
 * spend, blended performance (ROAS/CAC/AOV via Shopify) and an inventory flag.
 * Per-account failures are isolated so one broken connection never blanks the
 * whole Marketing view. The gathering logic is shared with the cron watchdog
 * via `gatherMarketingData`.
 *
 * GET  /api/marketing/ad-comments — recent comments on Meta ad posts (FB/IG).
 * POST /api/marketing/ad-comments/reply — reply to a Facebook Page ad comment.
 */

import {
  gatherMarketingData,
  readGoogleAdsConfig,
  readMetaGraphVersion,
  type MarketingStoredAccount,
} from "../lib/marketingData.ts";
import { accountInBusinessProfile, readRequestBodyBusinessProfileId, readRequestBusinessProfileId } from "../lib/profileScope.ts";
import { fetchMetaAdComments, replyMetaAdComment } from "../providers/metaAdComments.ts";

type MarketingRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  getStoredAccountAccess: (
    stored: MarketingStoredAccount,
    userId: string,
  ) => { allowed: boolean; migrate: boolean };
  tokenStore: {
    entries: () => Promise<Array<[string, MarketingStoredAccount]>>;
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
  };
};

async function loadMetaAccountsForUser(
  deps: MarketingRouteDeps,
  userId: string,
  businessProfileId: string | null
): Promise<MarketingStoredAccount[]> {
  const { getStoredAccountAccess, tokenStore } = deps;
  const meta: MarketingStoredAccount[] = [];
  for (const [accountId, rawStored] of await tokenStore.entries()) {
    const stored = rawStored as MarketingStoredAccount;
    if (String(stored.platform || "") !== "meta_business") continue;
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) continue;
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) continue;
    meta.push(stored);
  }
  return meta;
}

export function registerMarketingRoutes(app: import("express").Express, deps: MarketingRouteDeps) {
  const { getSessionUserId, getStoredAccountAccess, tokenStore } = deps;

  app.get("/api/marketing/campaigns", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Scope to the caller's active business profile so one user's profiles
    // never aggregate each other's ad/store accounts.
    const businessProfileId = readRequestBusinessProfileId(req);

    const meta: MarketingStoredAccount[] = [];
    const google: MarketingStoredAccount[] = [];
    let shopify: MarketingStoredAccount | null = null;

    for (const [accountId, rawStored] of await tokenStore.entries()) {
      const stored = rawStored as MarketingStoredAccount;
      const platform = String(stored.platform || "");
      if (platform !== "meta_business" && platform !== "google_ads" && platform !== "shopify") continue;
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;
      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }
      if (!accountInBusinessProfile(stored, businessProfileId)) continue;
      if (platform === "meta_business") meta.push(stored);
      else if (platform === "google_ads") google.push(stored);
      else if (platform === "shopify" && !shopify) shopify = stored;
    }

    const data = await gatherMarketingData(
      { meta, google, shopify },
      { graphVersion: readMetaGraphVersion(), googleAdsConfig: readGoogleAdsConfig() },
    );

    return res.json(data);
  });

  app.get("/api/marketing/ad-comments", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const businessProfileId = readRequestBusinessProfileId(req);
    const meta = await loadMetaAccountsForUser(deps, userId, businessProfileId);
    if (meta.length === 0) {
      return res.json({
        connected: false,
        accountName: null,
        comments: [],
        adsScanned: 0,
        needsReconnect: false,
        needsPages: false,
        note: "Connect Meta Business (Official API) to load ad comments.",
      });
    }

    // Prefer the first profile-scoped Meta connection (same as campaign gather).
    const result = await fetchMetaAdComments(meta[0], readMetaGraphVersion());
    return res.json(result);
  });

  app.post("/api/marketing/ad-comments/reply", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const commentId = String(req.body?.commentId || "").trim();
    const message = String(req.body?.message || "").trim();
    const platform = String(req.body?.platform || "facebook").trim() as "facebook" | "instagram";
    const pageId = req.body?.pageId != null ? String(req.body.pageId) : null;
    if (!commentId || !message) {
      return res.status(400).json({ error: "commentId and message are required" });
    }

    const businessProfileId =
      readRequestBusinessProfileId(req) || readRequestBodyBusinessProfileId(req);
    const meta = await loadMetaAccountsForUser(deps, userId, businessProfileId);
    if (meta.length === 0) {
      return res.status(400).json({ error: "Meta Business is not connected for this profile." });
    }

    const result = await replyMetaAdComment(meta[0], readMetaGraphVersion(), {
      commentId,
      message,
      platform,
      pageId,
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error || "Couldn't post reply." });
    }
    return res.json({ ok: true, id: result.id });
  });
}
