/**
 * Google Ads API — active campaigns + 7-day spend for a connected `google_ads`
 * account.
 *
 * Google Ads is gated behind a developer token (granted by Google to a manager
 * account) that most setups won't have yet, plus a customer id that isn't known
 * at connect time. This provider degrades gracefully: with no developer token
 * it reports `configured: false` so the UI can explain the one-time setup,
 * rather than throwing. When configured it refreshes the OAuth token, discovers
 * the first accessible customer, and runs a GAQL query for enabled campaigns.
 */

import type { AdAccountCampaigns, AdCampaign } from "./metaAds.ts";

/**
 * Google Ads API versions sunset roughly a year after release (v17 died
 * 2025-06-04 and silently broke this provider). Default to a current version
 * and allow overriding via env so the next sunset is a config change, not a
 * code change.
 */
const DEFAULT_ADS_API_VERSION = "v23";

function adsApiBase(version?: string): string {
  const v = String(version || process.env.GOOGLE_ADS_API_VERSION || DEFAULT_ADS_API_VERSION)
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return `https://googleads.googleapis.com/${v}`;
}

type GoogleAdsStored = Record<string, unknown> & {
  refreshToken?: string;
  username?: string;
};

export interface GoogleAdsConfig {
  developerToken?: string;
  loginCustomerId?: string;
  /** Explicit ads customer id (no dashes) — skips first-account discovery. */
  customerId?: string;
  apiVersion?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

export async function fetchGoogleAdsActiveCampaigns(
  stored: GoogleAdsStored,
  config: GoogleAdsConfig,
): Promise<AdAccountCampaigns> {
  const accountName = String(stored.username || "Google Ads");
  const base: AdAccountCampaigns = { platform: "google_ads", accountName, campaigns: [] };

  const developerToken = String(config.developerToken || "").trim();
  if (!developerToken) {
    return { ...base, note: "Google Ads reporting needs a developer token — set GOOGLE_ADS_DEVELOPER_TOKEN." };
  }
  const refreshToken = String(stored.refreshToken || "");
  const clientId = String(config.googleClientId || "");
  const clientSecret = String(config.googleClientSecret || "");
  if (!refreshToken || !clientId || !clientSecret) {
    return { ...base, note: "Reconnect Google Ads to load campaigns." };
  }

  const accessToken = await refreshAccessToken(refreshToken, clientId, clientSecret);
  if (!accessToken) return { ...base, note: "Google Ads access expired — reconnect the account." };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (config.loginCustomerId) headers["login-customer-id"] = String(config.loginCustomerId).replace(/-/g, "");

  const ADS_API = adsApiBase(config.apiVersion);

  // 1. Use the configured customer id when set; otherwise discover the first
  //    accessible customer (ads account).
  let customerId = String(config.customerId || "").replace(/-/g, "").trim();
  if (!customerId) {
    try {
      const res = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { resourceNames?: string[]; error?: unknown };
      if (!res.ok || !Array.isArray(body.resourceNames) || body.resourceNames.length === 0) {
        return { ...base, note: "No Google Ads account is accessible for this login." };
      }
      customerId = String(body.resourceNames[0]).split("/")[1] || "";
    } catch {
      return { ...base, note: "Couldn't reach the Google Ads API. Try again shortly." };
    }
  }
  if (!customerId) return { ...base, note: "No Google Ads account is accessible for this login." };

  // 2. Query enabled campaigns + trailing-7-day metrics (segmented by date,
  //    so the same campaign returns one row per day — aggregated below).
  const query =
    "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
    "campaign_budget.amount_micros, customer.currency_code, metrics.cost_micros, " +
    "metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, " +
    "metrics.conversions_from_interactions_rate, metrics.cost_per_conversion, " +
    "metrics.conversions_value_per_cost, metrics.search_impression_share, " +
    "metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share " +
    "FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_7_DAYS";

  let results: Array<Record<string, unknown>>;
  let currency: string | undefined;
  try {
    const res = await fetch(`${ADS_API}/customers/${customerId}/googleAds:searchStream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as
      | Array<{ results?: Array<Record<string, unknown>> }>
      | { error?: { message?: string } };
    if (!Array.isArray(body)) {
      const msg = (body as { error?: { message?: string } })?.error?.message;
      return { ...base, note: msg || "Couldn't load Google Ads campaigns." };
    }
    results = body.flatMap((batch) => (Array.isArray(batch.results) ? batch.results : []));
  } catch {
    return { ...base, note: "Couldn't reach the Google Ads API. Try again shortly." };
  }

  const MICROS = 1_000_000;

  /** Weighted average helper for Google daily segmented rows. */
  function blendShare(
    current: { value: number; weight: number } | undefined,
    next: number,
    weight: number,
  ): { value: number; weight: number } {
    if (!Number.isFinite(next) || weight <= 0) return current ?? { value: 0, weight: 0 };
    const base = current ?? { value: 0, weight: 0 };
    const totalWeight = base.weight + weight;
    return {
      value: totalWeight > 0 ? (base.value * base.weight + next * weight) / totalWeight : next,
      weight: totalWeight,
    };
  }

  const shareById = new Map<
    string,
    {
      budgetLost?: { value: number; weight: number };
      rankLost?: { value: number; weight: number };
      impressionShare?: { value: number; weight: number };
    }
  >();

  const byId = new Map<string, AdCampaign>();
  for (const row of results) {
    const campaign = (row.campaign || {}) as Record<string, unknown>;
    const metrics = (row.metrics || {}) as Record<string, unknown>;
    const budget = (row.campaignBudget || {}) as Record<string, unknown>;
    const customer = (row.customer || {}) as Record<string, unknown>;
    if (customer.currencyCode) currency = String(customer.currencyCode);
    const id = String(campaign.id || "");
    if (!id) continue;
    const existing = byId.get(id) ?? {
      id,
      name: String(campaign.name || "Untitled campaign"),
      status: String(campaign.status || "ENABLED"),
      objective: campaign.advertisingChannelType ? String(campaign.advertisingChannelType) : undefined,
      dailyBudget: budget.amountMicros != null ? Number(budget.amountMicros) / MICROS : undefined,
      spend7d: 0,
      impressions7d: 0,
      clicks7d: 0,
      conversions7d: 0,
      conversionValue7d: 0,
    };
    const dayImpressions = Number(metrics.impressions || 0);
    existing.spend7d = (existing.spend7d ?? 0) + Number(metrics.costMicros || 0) / MICROS;
    existing.impressions7d = (existing.impressions7d ?? 0) + dayImpressions;
    existing.clicks7d = (existing.clicks7d ?? 0) + Number(metrics.clicks || 0);
    existing.conversions7d = (existing.conversions7d ?? 0) + Number(metrics.conversions || 0);
    existing.conversionValue7d = (existing.conversionValue7d ?? 0) + Number(metrics.conversionsValue || 0);

    const shares = shareById.get(id) ?? {};
    const budgetLost = Number(metrics.searchBudgetLostImpressionShare);
    const rankLost = Number(metrics.searchRankLostImpressionShare);
    const impressionShare = Number(metrics.searchImpressionShare);
    if (Number.isFinite(budgetLost)) {
      shares.budgetLost = blendShare(shares.budgetLost, budgetLost, dayImpressions);
    }
    if (Number.isFinite(rankLost)) {
      shares.rankLost = blendShare(shares.rankLost, rankLost, dayImpressions);
    }
    if (Number.isFinite(impressionShare)) {
      shares.impressionShare = blendShare(shares.impressionShare, impressionShare, dayImpressions);
    }
    shareById.set(id, shares);
    byId.set(id, existing);
  }

  // Derive per-campaign ROAS, conversion rate and search auction metrics.
  const campaigns = Array.from(byId.entries()).map(([id, c]) => {
    const shares = shareById.get(id);
    const conversionRate =
      c.clicks7d != null && c.clicks7d > 0 && c.conversions7d != null ? c.conversions7d / c.clicks7d : undefined;
    const costPerConversion =
      c.conversions7d != null && c.conversions7d > 0 && c.spend7d != null ? c.spend7d / c.conversions7d : undefined;
    return {
      ...c,
      conversionRate7d: conversionRate,
      costPerConversion7d: costPerConversion,
      searchImpressionShare: shares?.impressionShare?.weight ? shares.impressionShare.value : undefined,
      searchBudgetLostShare: shares?.budgetLost?.weight ? shares.budgetLost.value : undefined,
      searchRankLostShare: shares?.rankLost?.weight ? shares.rankLost.value : undefined,
      roas7d:
        c.conversionValue7d != null && c.spend7d != null && c.spend7d > 0
          ? c.conversionValue7d / c.spend7d
          : undefined,
    };
  });

  return { ...base, currency, campaigns };
}
