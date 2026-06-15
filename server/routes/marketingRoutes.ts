/**
 * GET /api/marketing/campaigns — active ad campaigns across the user's
 * connected `meta_business` and `google_ads` accounts, with trailing-7-day
 * spend. Per-account failures are isolated and reported as a `note` so one
 * broken connection never blanks the whole Marketing view.
 */

import { fetchMetaActiveCampaigns, type AdAccountCampaigns } from "../providers/metaAds.ts";
import { fetchGoogleAdsActiveCampaigns } from "../providers/googleAds.ts";
import { fetchShopifyRevenueSummary, fetchShopifyLowStock } from "../providers/shopify.ts";
import { computeMarketingPerformance, type AdPlatform } from "../lib/marketingPerformance.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  accessToken?: string;
  shop?: string;
};

const PERFORMANCE_WINDOW_DAYS = 7;

type MarketingRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  getStoredAccountAccess: (stored: StoredAccount, userId: string) => { allowed: boolean; migrate: boolean };
  tokenStore: {
    entries: () => Promise<Array<[string, StoredAccount]>>;
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

    const graphVersion = String(process.env.META_GRAPH_VERSION || "v20.0").trim().replace(/^\/+|\/+$/g, "");
    const googleAdsConfig = {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };

    const connected = { meta_business: false, google_ads: false, shopify: false };
    const tasks: Promise<AdAccountCampaigns>[] = [];
    let shopifyAccount: StoredAccount | null = null;

    for (const [accountId, rawStored] of await tokenStore.entries()) {
      const stored = rawStored as StoredAccount;
      const platform = String(stored.platform || "");
      if (platform !== "meta_business" && platform !== "google_ads" && platform !== "shopify") continue;
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) continue;
      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }

      if (platform === "meta_business") {
        connected.meta_business = true;
        tasks.push(fetchMetaActiveCampaigns(stored, graphVersion));
      } else if (platform === "google_ads") {
        connected.google_ads = true;
        tasks.push(fetchGoogleAdsActiveCampaigns(stored, googleAdsConfig));
      } else if (platform === "shopify" && !shopifyAccount) {
        connected.shopify = true;
        shopifyAccount = stored;
      }
    }

    const shopToken = shopifyAccount ? String(shopifyAccount.accessToken || "") : "";
    const shopDomain = shopifyAccount?.shop ? String(shopifyAccount.shop) : undefined;
    const [settled, revenueSummary, stockSummary] = await Promise.all([
      Promise.allSettled(tasks),
      shopifyAccount
        ? fetchShopifyRevenueSummary(shopToken, shopDomain, PERFORMANCE_WINDOW_DAYS)
        : Promise.resolve(null),
      shopifyAccount ? fetchShopifyLowStock(shopToken, shopDomain) : Promise.resolve(null),
    ]);

    const platforms: AdAccountCampaigns[] = settled
      .filter((r): r is PromiseFulfilledResult<AdAccountCampaigns> => r.status === "fulfilled")
      .map((r) => r.value);

    // Sum 7-day spend per platform, but only for platforms that actually
    // returned spend numbers (so an unconfigured Google Ads doesn't count as 0).
    const adSpendByPlatform: Partial<Record<AdPlatform, number>> = {};
    let adSpendCurrency: string | null = null;
    for (const group of platforms) {
      const hasSpend = group.campaigns.some((c) => c.spend7d != null);
      if (!hasSpend) continue;
      adSpendByPlatform[group.platform] = group.campaigns.reduce((s, c) => s + (c.spend7d ?? 0), 0);
      if (!adSpendCurrency && group.currency) adSpendCurrency = group.currency;
    }

    const performance = computeMarketingPerformance({
      windowDays: PERFORMANCE_WINDOW_DAYS,
      adSpendByPlatform,
      adSpendCurrency,
      revenue: revenueSummary ? revenueSummary.revenue : null,
      orders: revenueSummary ? revenueSummary.orders : null,
      revenueCurrency: revenueSummary ? revenueSummary.currency : null,
    });

    // Cross-source flag: spending on ads while the shelves are empty is wasted
    // budget. Only surfaced when both an active campaign and a stock gap exist.
    const activeCampaigns = platforms.reduce(
      (sum, group) => sum + group.campaigns.filter((c) => /^(active|enabled)$/i.test(c.status)).length,
      0,
    );
    const inventoryAlert =
      stockSummary && activeCampaigns > 0 && stockSummary.outOfStock + stockSummary.lowStock > 0
        ? { activeCampaigns, ...stockSummary }
        : null;

    return res.json({ platforms, connected, performance, inventoryAlert });
  });
}
