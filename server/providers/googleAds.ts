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

const ADS_API = "https://googleads.googleapis.com/v17";

type GoogleAdsStored = Record<string, unknown> & {
  refreshToken?: string;
  username?: string;
};

export interface GoogleAdsConfig {
  developerToken?: string;
  loginCustomerId?: string;
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

  // 1. Discover the first accessible customer (ads account).
  let customerId: string;
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
  if (!customerId) return { ...base, note: "No Google Ads account is accessible for this login." };

  // 2. Query enabled campaigns + trailing-7-day metrics (segmented by date,
  //    so the same campaign returns one row per day — aggregated below).
  const query =
    "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
    "campaign_budget.amount_micros, customer.currency_code, metrics.cost_micros, " +
    "metrics.impressions, metrics.clicks, metrics.conversions_value FROM campaign " +
    "WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_7_DAYS";

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
      conversionValue7d: 0,
    };
    existing.spend7d = (existing.spend7d ?? 0) + Number(metrics.costMicros || 0) / MICROS;
    existing.impressions7d = (existing.impressions7d ?? 0) + Number(metrics.impressions || 0);
    existing.clicks7d = (existing.clicks7d ?? 0) + Number(metrics.clicks || 0);
    existing.conversionValue7d = (existing.conversionValue7d ?? 0) + Number(metrics.conversionsValue || 0);
    byId.set(id, existing);
  }

  // Derive per-campaign ROAS now that spend + conversion value are aggregated.
  const campaigns = Array.from(byId.values()).map((c) => ({
    ...c,
    roas7d:
      c.conversionValue7d != null && c.spend7d != null && c.spend7d > 0
        ? c.conversionValue7d / c.spend7d
        : undefined,
  }));

  return { ...base, currency, campaigns };
}
