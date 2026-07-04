/**
 * Meta (Facebook/Instagram) Marketing API — active campaigns + 7-day spend for
 * a connected `meta_business` account. Uses the long-lived access token and the
 * ad account id captured at connect time (see oauthRoutes meta_business flow).
 *
 * Returns a normalised, provider-agnostic shape so the marketing route can
 * merge Meta and Google Ads campaigns into one list.
 */

import type { AdChannel } from "../lib/marketingBenchmarks.ts";

export type MarketingGrade = "A" | "B" | "C" | "D" | "F" | "—";
export type MarketingVerdict = "good" | "ok" | "poor" | "unknown";

export interface CampaignMetrics {
  spend: number | null;
  clicks: number | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  conversions: number | null;
  conversionRate: number | null;
  costPerConversion: number | null;
  conversionValue: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  channel: AdChannel;
  searchImpressionShare: number | null;
  searchBudgetLostShare: number | null;
  searchRankLostShare: number | null;
}

export interface CampaignScore {
  score: number;
  grade: MarketingGrade;
  label: string;
  verdict: MarketingVerdict;
  reasons: string[];
  /** Sub-scores 0–100 shown in the UI breakdown. */
  breakdown: {
    roas: number;
    engagement: number;
    conversions: number;
    scale: number;
    audience?: number;
  };
  /** Concrete next steps for this campaign. */
  actions: string[];
}

export interface AdCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  /** Daily budget in major currency units (e.g. 50.00), when set. */
  dailyBudget?: number;
  /** Lifetime budget in major currency units, when set. */
  lifetimeBudget?: number;
  /** Spend over the trailing 7 days, in major currency units. */
  spend7d?: number;
  impressions7d?: number;
  clicks7d?: number;
  /** Unique people reached (Meta). */
  reach7d?: number;
  /** Avg impressions per person (Meta fatigue signal). */
  frequency7d?: number;
  /** Purchase/conversion count from platform reporting. */
  conversions7d?: number;
  /** Platform-reported cost per conversion/purchase. */
  costPerConversion7d?: number;
  /** Google: clicks → conversions rate (0–1). */
  conversionRate7d?: number;
  /** Google Search: share of eligible impressions won (0–1). */
  searchImpressionShare?: number;
  /** Google Search: IS lost due to budget (0–1). */
  searchBudgetLostShare?: number;
  /** Google Search: IS lost due to ad rank (0–1). */
  searchRankLostShare?: number;
  /** Platform-attributed purchase value over the trailing 7 days. */
  conversionValue7d?: number;
  /** Platform-attributed ROAS (conversion value ÷ spend) over 7 days. */
  roas7d?: number;
  /** Derived metrics and grade — attached by marketingAnalytics. */
  metrics?: CampaignMetrics;
  score?: CampaignScore;
}

export interface AdAccountCampaigns {
  platform: "meta_business" | "google_ads";
  accountName: string;
  currency?: string;
  campaigns: AdCampaign[];
  /** Populated when campaigns couldn't be loaded (auth, setup, upstream). */
  note?: string;
}

type MetaStored = Record<string, unknown> & {
  accessToken?: string;
  username?: string;
  metaAdAccountId?: string | null;
  metaAdAccounts?: Array<{ id?: string; name?: string; currency?: string }>;
};

const MONEY_MINOR_UNIT = 100;

function toMajor(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n / MONEY_MINOR_UNIT : undefined;
}

/** Sum of purchase action values (omni_purchase / purchase) from an insights row. */
function metaPurchaseValue(row: Record<string, unknown>): number | undefined {
  const values = row.action_values;
  if (!Array.isArray(values)) return undefined;
  let total = 0;
  let found = false;
  for (const entry of values) {
    const e = entry as { action_type?: string; value?: unknown };
    if (!/purchase/i.test(String(e?.action_type || ""))) continue;
    const n = Number(e?.value);
    if (Number.isFinite(n)) {
      total += n;
      found = true;
    }
  }
  return found ? total : undefined;
}

/** Meta's reported purchase ROAS (first entry) from an insights row. */
function metaPurchaseRoas(row: Record<string, unknown>): number | undefined {
  const roas = row.purchase_roas;
  if (!Array.isArray(roas) || roas.length === 0) return undefined;
  const n = Number((roas[0] as { value?: unknown })?.value);
  return Number.isFinite(n) ? n : undefined;
}

function metaActionCount(row: Record<string, unknown>, pattern: RegExp): number | undefined {
  const actions = row.actions;
  if (!Array.isArray(actions)) return undefined;
  let total = 0;
  let found = false;
  for (const entry of actions) {
    const e = entry as { action_type?: string; value?: unknown };
    if (!pattern.test(String(e?.action_type || ""))) continue;
    const n = Number(e?.value);
    if (Number.isFinite(n)) {
      total += n;
      found = true;
    }
  }
  return found ? total : undefined;
}

function metaCostPerAction(row: Record<string, unknown>, pattern: RegExp): number | undefined {
  const costs = row.cost_per_action_type;
  if (!Array.isArray(costs)) return undefined;
  for (const entry of costs) {
    const e = entry as { action_type?: string; value?: unknown };
    if (!pattern.test(String(e?.action_type || ""))) continue;
    const n = Number(e?.value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export async function fetchMetaActiveCampaigns(
  stored: MetaStored,
  graphVersion: string,
): Promise<AdAccountCampaigns> {
  const graphBase = `https://graph.facebook.com/${graphVersion}`;
  const accessToken = String(stored.accessToken || "");
  const accounts = Array.isArray(stored.metaAdAccounts) ? stored.metaAdAccounts : [];
  const adAccountId = String(stored.metaAdAccountId || accounts[0]?.id || "").trim();
  const accountName = String(accounts[0]?.name || stored.username || "Meta Business");
  const currency = accounts.find((a) => a?.currency)?.currency;

  const base: AdAccountCampaigns = { platform: "meta_business", accountName, currency, campaigns: [] };

  if (!accessToken) return { ...base, note: "Reconnect Meta Business to load campaigns." };
  if (!adAccountId) {
    return { ...base, note: "No ad account is linked to this Meta connection." };
  }

  const campaignsUrl =
    `${graphBase}/${encodeURIComponent(adAccountId)}/campaigns` +
    `?fields=name,status,objective,daily_budget,lifetime_budget` +
    `&effective_status=${encodeURIComponent('["ACTIVE"]')}&limit=50` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  let campaignsBody: { data?: unknown[]; error?: { message?: string; code?: number } };
  try {
    const res = await fetch(campaignsUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    campaignsBody = (await res.json().catch(() => ({}))) as typeof campaignsBody;
    if (campaignsBody?.error) {
      const code = campaignsBody.error.code;
      const reconnect = code === 190 || code === 102 || code === 463;
      return {
        ...base,
        note: reconnect
          ? "Meta access expired — reconnect Meta Business."
          : campaignsBody.error.message || "Couldn't load Meta campaigns.",
      };
    }
  } catch {
    return { ...base, note: "Couldn't reach the Meta Marketing API. Try again shortly." };
  }

  const rows = Array.isArray(campaignsBody.data) ? campaignsBody.data : [];
  const campaigns: AdCampaign[] = rows
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
    .map((r) => ({
      id: String(r.id || ""),
      name: String(r.name || "Untitled campaign"),
      status: String(r.status || "ACTIVE"),
      objective: r.objective ? String(r.objective) : undefined,
      dailyBudget: r.daily_budget != null ? toMajor(r.daily_budget) : undefined,
      lifetimeBudget: r.lifetime_budget != null ? toMajor(r.lifetime_budget) : undefined,
    }))
    .filter((c) => c.id);

  if (campaigns.length === 0) return base;

  // Best-effort 7-day spend per campaign. Failure here is non-fatal — the
  // campaign list still renders, just without spend numbers.
  try {
    const insightsUrl =
      `${graphBase}/${encodeURIComponent(adAccountId)}/insights` +
      `?fields=campaign_id,spend,impressions,clicks,reach,frequency,purchase_roas,action_values,actions,cost_per_action_type` +
      `&level=campaign&date_preset=last_7d&limit=200` +
      `&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(insightsUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>> };
    const byCampaign = new Map<string, Record<string, unknown>>();
    for (const row of Array.isArray(body.data) ? body.data : []) {
      const id = String(row.campaign_id || "");
      if (id) byCampaign.set(id, row);
    }
    for (const campaign of campaigns) {
      const ins = byCampaign.get(campaign.id);
      if (!ins) continue;
      const spend = Number(ins.spend);
      const impressions = Number(ins.impressions);
      const clicks = Number(ins.clicks);
      const reach = Number(ins.reach);
      const frequency = Number(ins.frequency);
      if (Number.isFinite(spend)) campaign.spend7d = spend;
      if (Number.isFinite(impressions)) campaign.impressions7d = impressions;
      if (Number.isFinite(clicks)) campaign.clicks7d = clicks;
      if (Number.isFinite(reach)) campaign.reach7d = reach;
      if (Number.isFinite(frequency)) campaign.frequency7d = frequency;

      const purchases = metaActionCount(ins, /purchase/i);
      if (purchases != null) campaign.conversions7d = purchases;
      const costPerPurchase = metaCostPerAction(ins, /purchase/i);
      if (costPerPurchase != null) campaign.costPerConversion7d = costPerPurchase;

      // Meta attributes purchases back to the campaign. Prefer the absolute
      // purchase value from action_values; fall back to purchase_roas × spend.
      const conversionValue = metaPurchaseValue(ins);
      const reportedRoas = metaPurchaseRoas(ins);
      if (conversionValue != null) campaign.conversionValue7d = conversionValue;
      else if (reportedRoas != null && Number.isFinite(spend)) campaign.conversionValue7d = reportedRoas * spend;
      if (reportedRoas != null) campaign.roas7d = reportedRoas;
      else if (campaign.conversionValue7d != null && Number.isFinite(spend) && spend > 0) {
        campaign.roas7d = campaign.conversionValue7d / spend;
      }
    }
  } catch {
    // Spend is optional enrichment — ignore failures.
  }

  return { ...base, campaigns };
}
