/**
 * Cron job: daily marketing snapshot into marketing_snapshots.
 */

import { buildCampaignSnapshotRows } from "../../lib/marketingCampaignSnapshots.ts";
import { gatherMarketingData, readGoogleAdsConfig, readMetaGraphVersion } from "../../lib/marketingData.ts";

export function registerMarketingSnapshotCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  }
) {
  /**
   * Daily marketing snapshot: for every business profile with ad/store accounts,
   * recompute today's blended KPIs and upsert one row into marketing_snapshots.
   * This is what powers the week-over-week trend on the Marketing page. Runs for
   * all such profiles (not just alert opt-ins) so the history is continuous.
   */
  app.get("/api/cron/marketing-snapshot", withRunRecording("marketing-snapshot", supabaseAdmin, async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !tokenStore) {
      return res.status(503).json({ error: "dependencies_not_configured" });
    }

    const startedAt = Date.now();
    const timeBudgetMs = 50_000;
    const today = new Date().toISOString().slice(0, 10);

    try {
      const byProfile = new Map();
      for (const [, rawStored] of await tokenStore.entries()) {
        const stored = rawStored || {};
        const platform = String(stored.platform || "");
        if (platform !== "meta_business" && platform !== "google_ads" && platform !== "shopify") continue;
        const pid = String(stored.profileId || "").trim();
        if (!pid) continue;
        if (!byProfile.has(pid)) byProfile.set(pid, { meta: [], google: [], shopify: null });
        const bucket = byProfile.get(pid);
        if (platform === "meta_business") bucket.meta.push(stored);
        else if (platform === "google_ads") bucket.google.push(stored);
        else if (platform === "shopify" && !bucket.shopify) bucket.shopify = stored;
      }

      const graphVersion = readMetaGraphVersion();
      const googleAdsConfig = readGoogleAdsConfig();
      const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
      const cronNow = new Date();
      let written = 0;
      let skipped = 0;
      let skippedForSchedule = 0;
      let deferred = 0;

      for (const [profileId, accounts] of byProfile) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        if (!isProfileJobDueNow(settingsByProfile.get(profileId), "marketing-snapshot", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
        // Need an ad platform or a store to have anything to snapshot.
        if (accounts.meta.length === 0 && accounts.google.length === 0 && !accounts.shopify) {
          skipped += 1;
          continue;
        }
        try {
          const data = await gatherMarketingData(accounts, { graphVersion, googleAdsConfig });
          const p = data.performance;
          if (p.adSpend == null && p.revenue == null) {
            skipped += 1;
            continue;
          }
          const { error } = await supabaseAdmin.from("marketing_snapshots").upsert(
            {
              business_profile_id: profileId,
              snapshot_date: today,
              ad_spend: p.adSpend,
              revenue: p.revenue,
              orders: p.orders,
              roas: p.roas,
              currency: p.adSpendCurrency || p.revenueCurrency,
              portfolio_score: data.analytics?.portfolioScore ?? null,
              portfolio_grade: data.analytics?.portfolioGrade ?? null,
              campaigns_poor: data.analytics?.campaignsPoor ?? null,
            },
            { onConflict: "business_profile_id,snapshot_date" },
          );
          if (error) {
            skipped += 1;
            console.warn(`[cron] marketing-snapshot upsert failed profile=${profileId}:`, error.message);
          } else {
            written += 1;
          }

          const campaignRows = buildCampaignSnapshotRows(profileId, today, data.platforms);
          if (campaignRows.length > 0) {
            const { error: campErr } = await supabaseAdmin.from("marketing_campaign_snapshots").upsert(
              campaignRows,
              { onConflict: "business_profile_id,snapshot_date,platform,campaign_id" },
            );
            if (campErr) {
              console.warn(
                `[cron] marketing-snapshot campaign rows failed profile=${profileId}:`,
                campErr.message,
              );
            }
          }
        } catch (err) {
          skipped += 1;
          console.warn(
            `[cron] marketing-snapshot profile=${profileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(`[cron] marketing-snapshot: profiles=${byProfile.size} written=${written} skipped=${skipped} skippedForSchedule=${skippedForSchedule} deferred=${deferred}`);
      return res.json({ ok: true, written, skipped, skippedForSchedule, deferred });
    } catch (e) {
      console.error("[cron] marketing-snapshot unexpected:", e?.message || e);
      return res.status(500).json({ error: "marketing_snapshot_failed" });
    }
  }));
}
