/**
 * Shared marketing data gathering — given a set of connected ad/store accounts,
 * fetches active campaigns + spend, ties them to Shopify revenue, and derives
 * the cross-source performance + inventory flag.
 *
 * Extracted so both the HTTP route (per request, user-scoped) and the cron
 * watchdog (per business profile) compute marketing the exact same way.
 */

import { fetchMetaActiveCampaigns, type AdAccountCampaigns } from "../providers/metaAds.ts";
import { fetchGoogleAdsActiveCampaigns, type GoogleAdsConfig } from "../providers/googleAds.ts";
import { fetchShopifyRevenueSummary, fetchShopifyLowStock } from "../providers/shopify.ts";
import {
  computeMarketingPerformance,
  type AdPlatform,
  type MarketingPerformance,
} from "./marketingPerformance.ts";
import {
  computeMarketingAnalytics,
  enrichPlatformsWithScores,
  type MarketingAnalytics,
} from "./marketingAnalytics.ts";

export const PERFORMANCE_WINDOW_DAYS = 7;

export type MarketingStoredAccount = Record<string, unknown> & {
  platform?: string;
  accessToken?: string;
  shop?: string;
};

export interface InventoryAdsAlert {
  activeCampaigns: number;
  threshold: number;
  outOfStock: number;
  lowStock: number;
  examples: string[];
}

export interface MarketingData {
  platforms: AdAccountCampaigns[];
  connected: { meta_business: boolean; google_ads: boolean; shopify: boolean };
  performance: MarketingPerformance;
  inventoryAlert: InventoryAdsAlert | null;
  analytics: MarketingAnalytics | null;
}

export interface GatherMarketingOptions {
  graphVersion: string;
  googleAdsConfig: GoogleAdsConfig;
  windowDays?: number;
}

export function readMetaGraphVersion(): string {
  return String(process.env.META_GRAPH_VERSION || "v20.0").trim().replace(/^\/+|\/+$/g, "");
}

export function readGoogleAdsConfig(): GoogleAdsConfig {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

export async function gatherMarketingData(
  accounts: { meta: MarketingStoredAccount[]; google: MarketingStoredAccount[]; shopify: MarketingStoredAccount | null },
  options: GatherMarketingOptions,
): Promise<MarketingData> {
  const windowDays = options.windowDays ?? PERFORMANCE_WINDOW_DAYS;
  const connected = {
    meta_business: accounts.meta.length > 0,
    google_ads: accounts.google.length > 0,
    shopify: Boolean(accounts.shopify),
  };

  const campaignTasks: Promise<AdAccountCampaigns>[] = [
    ...accounts.meta.map((a) => fetchMetaActiveCampaigns(a, options.graphVersion)),
    ...accounts.google.map((a) => fetchGoogleAdsActiveCampaigns(a, options.googleAdsConfig)),
  ];

  const shopToken = accounts.shopify ? String(accounts.shopify.accessToken || "") : "";
  const shopDomain = accounts.shopify?.shop ? String(accounts.shopify.shop) : undefined;

  const [settled, revenueSummary, stockSummary] = await Promise.all([
    Promise.allSettled(campaignTasks),
    accounts.shopify ? fetchShopifyRevenueSummary(shopToken, shopDomain, windowDays) : Promise.resolve(null),
    accounts.shopify ? fetchShopifyLowStock(shopToken, shopDomain) : Promise.resolve(null),
  ]);

  const platforms: AdAccountCampaigns[] = settled
    .filter((r): r is PromiseFulfilledResult<AdAccountCampaigns> => r.status === "fulfilled")
    .map((r) => r.value);

  // Only count platforms that actually returned spend (unconfigured ≠ 0).
  const adSpendByPlatform: Partial<Record<AdPlatform, number>> = {};
  let adSpendCurrency: string | null = null;
  for (const group of platforms) {
    if (!group.campaigns.some((c) => c.spend7d != null)) continue;
    adSpendByPlatform[group.platform] = group.campaigns.reduce((s, c) => s + (c.spend7d ?? 0), 0);
    if (!adSpendCurrency && group.currency) adSpendCurrency = group.currency;
  }

  const performance = computeMarketingPerformance({
    windowDays,
    adSpendByPlatform,
    adSpendCurrency,
    revenue: revenueSummary ? revenueSummary.revenue : null,
    orders: revenueSummary ? revenueSummary.orders : null,
    revenueCurrency: revenueSummary ? revenueSummary.currency : null,
  });

  const activeCampaigns = platforms.reduce(
    (sum, group) => sum + group.campaigns.filter((c) => /^(active|enabled)$/i.test(c.status)).length,
    0,
  );
  const inventoryAlert =
    stockSummary && activeCampaigns > 0 && stockSummary.outOfStock + stockSummary.lowStock > 0
      ? { activeCampaigns, ...stockSummary }
      : null;

  const scoredPlatforms = enrichPlatformsWithScores(platforms);
  const analytics = computeMarketingAnalytics(scoredPlatforms, performance);

  return { platforms: scoredPlatforms, connected, performance, inventoryAlert, analytics };
}
