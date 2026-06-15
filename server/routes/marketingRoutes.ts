/**
 * GET /api/marketing/campaigns — active ad campaigns across the user's
 * connected `meta_business` and `google_ads` accounts, with trailing-7-day
 * spend, blended performance (ROAS/CAC/AOV via Shopify) and an inventory flag.
 * Per-account failures are isolated so one broken connection never blanks the
 * whole Marketing view. The gathering logic is shared with the cron watchdog
 * via `gatherMarketingData`.
 */

import {
  gatherMarketingData,
  readGoogleAdsConfig,
  readMetaGraphVersion,
  type MarketingStoredAccount,
} from "../lib/marketingData.ts";

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

export function registerMarketingRoutes(app: import("express").Express, deps: MarketingRouteDeps) {
  const { getSessionUserId, getStoredAccountAccess, tokenStore } = deps;

  app.get("/api/marketing/campaigns", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

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
}
