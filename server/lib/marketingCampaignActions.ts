/**
 * Auto-pause poor Meta campaigns when marketing analytics flags them critical.
 * Google Ads pause is logged as a recommendation only (mutate API is heavier).
 */

import { gatherMarketingData, readGoogleAdsConfig, readMetaGraphVersion } from "./marketingData.ts";
import type { MarketingRecommendation } from "./marketingAnalytics.ts";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentStore.ts";
import { sendEmail } from "./email.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export const MARKETING_ACTIONS_LOG_KEY = "marketing-actions-log";

export interface MarketingActionLogEntry {
  campaignId: string;
  campaignName: string;
  platform: string;
  action: "paused" | "recommended";
  at: string;
}

export interface MarketingActionsLogDoc {
  entries: MarketingActionLogEntry[];
  lastRunAt?: string;
}

interface TokenStoreLike {
  get(accountId: string): Promise<Record<string, unknown> | null | undefined>;
}

function parseLogDoc(data: unknown): MarketingActionsLogDoc {
  if (!data || typeof data !== "object") return { entries: [] };
  const raw = data as Record<string, unknown>;
  const entries = Array.isArray(raw.entries)
    ? (raw.entries as MarketingActionLogEntry[]).filter((e) => e && typeof e.campaignId === "string")
    : [];
  return { entries, lastRunAt: raw.lastRunAt ? String(raw.lastRunAt) : undefined };
}

export async function pauseMetaCampaign(
  accessToken: string,
  graphVersion: string,
  campaignId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken || !campaignId) return { ok: false, error: "missing_credentials" };
  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(campaignId)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "PAUSED", access_token: accessToken }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; success?: boolean };
    if (!res.ok) return { ok: false, error: body?.error?.message || `meta_pause_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "meta_pause_failed" };
  }
}

function poorCampaignRecs(recommendations: MarketingRecommendation[]): MarketingRecommendation[] {
  return recommendations.filter(
    (r) => r.severity === "critical" && r.campaignId && r.platform === "meta_business"
  );
}

export async function runMarketingActions(deps: {
  supabaseAdmin: SupabaseAdminLike;
  tokenStore: TokenStoreLike;
  businessProfileId: string;
  profileName: string;
  metaAccountIds: string[];
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ paused: number; recommended: number; failed: number }> {
  const { supabaseAdmin, tokenStore, businessProfileId, profileName, metaAccountIds, notifyEmail, appUrl } = deps;

  const logDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, MARKETING_ACTIONS_LOG_KEY);
  const log = parseLogDoc(logDoc?.data);
  const actedIds = new Set(log.entries.map((e) => `${e.platform}:${e.campaignId}`));

  const accounts = { meta: [] as Record<string, unknown>[], google: [] as Record<string, unknown>[], shopify: null as Record<string, unknown> | null };
  const metaStored = await Promise.all(metaAccountIds.map((accountId) => tokenStore.get(accountId)));
  accounts.meta = metaStored.filter((stored): stored is Record<string, unknown> => Boolean(stored));

  const { data: googleRows } = await supabaseAdmin
    .from("connected_accounts")
    .select("id")
    .eq("business_profile_id", businessProfileId)
    .eq("platform", "google_ads")
    .is("disconnected_at", null);
  const googleStored = await Promise.all(
    (Array.isArray(googleRows) ? googleRows : []).map((row) => tokenStore.get(String(row.id)))
  );
  accounts.google = googleStored.filter((stored): stored is Record<string, unknown> => Boolean(stored));

  const { data: shopRow } = await supabaseAdmin
    .from("connected_accounts")
    .select("id")
    .eq("business_profile_id", businessProfileId)
    .eq("platform", "shopify")
    .is("disconnected_at", null)
    .maybeSingle();
  if (shopRow?.id) {
    const stored = await tokenStore.get(String(shopRow.id));
    if (stored) accounts.shopify = stored;
  }

  if (accounts.meta.length === 0 && accounts.google.length === 0) {
    return { paused: 0, recommended: 0, failed: 0 };
  }

  const data = await gatherMarketingData(accounts, {
    graphVersion: readMetaGraphVersion(),
    googleAdsConfig: readGoogleAdsConfig(),
  });

  const targets = poorCampaignRecs(data.analytics?.recommendations ?? []);
  if (targets.length === 0) {
    return { paused: 0, recommended: 0, failed: 0 };
  }

  const graphVersion = readMetaGraphVersion();
  let paused = 0;
  let recommended = 0;
  let failed = 0;
  const newEntries: MarketingActionLogEntry[] = [];

  for (const rec of targets.slice(0, 5)) {
    const key = `${rec.platform}:${rec.campaignId}`;
    if (actedIds.has(key)) continue;

    if (rec.platform === "meta_business" && accounts.meta.length > 0) {
      const token = String(accounts.meta[0]?.accessToken || "").trim();
      const result = await pauseMetaCampaign(token, graphVersion, String(rec.campaignId));
      if (result.ok) {
        paused += 1;
        newEntries.push({
          campaignId: String(rec.campaignId),
          campaignName: String(rec.campaignName || rec.title),
          platform: "meta_business",
          action: "paused",
          at: new Date().toISOString(),
        });
      } else {
        failed += 1;
      }
    } else if (rec.platform === "google_ads") {
      recommended += 1;
      newEntries.push({
        campaignId: String(rec.campaignId),
        campaignName: String(rec.campaignName || rec.title),
        platform: "google_ads",
        action: "recommended",
        at: new Date().toISOString(),
      });
    }
  }

  if (newEntries.length > 0) {
    await saveProfileDocument(supabaseAdmin, businessProfileId, MARKETING_ACTIONS_LOG_KEY, {
      entries: [...newEntries, ...log.entries].slice(0, 100),
      lastRunAt: new Date().toISOString(),
    });
  }

  if (notifyEmail && (paused > 0 || recommended > 0)) {
    const marketingUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/marketing` : "/marketing";
    const lines = newEntries.map(
      (e) =>
        `• ${e.campaignName} (${e.platform}) — ${e.action === "paused" ? "paused automatically" : "review manually"}`
    );
    await sendEmail({
      to: notifyEmail,
      subject: `${profileName}: ${paused + recommended} marketing action${paused + recommended === 1 ? "" : "s"} taken`,
      html:
        `<p>Automated marketing actions ran for poor-performing campaigns:</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` +
        `<p><a href="${marketingUrl}">Open Marketing</a></p>`,
      text: `Marketing actions:\n${lines.join("\n")}\n\nOpen: ${marketingUrl}`,
    });
  }

  return { paused, recommended, failed };
}
