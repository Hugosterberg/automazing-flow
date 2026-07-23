/**
 * Cron job: marketing watchdog — emails when ad spend is underwater or
 * campaigns run while the store is out of stock.
 */

import { sendEmail, isEmailConfigured } from "../../lib/email.ts";
import { buildMarketingAlert, extractPoorCampaignsForAlert } from "../../lib/marketingAlert.ts";
import { gatherMarketingData, readGoogleAdsConfig, readMetaGraphVersion } from "../../lib/marketingData.ts";
import { portfolioScoreDeltaFromSnapshots } from "../../lib/marketingSnapshotTrend.ts";
import { logActivity } from "../../lib/activityLog.ts";

export function registerMarketingAlertsCron(
  app,
  {
    withRunRecording,
    baseUrl,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    resolveRecipientEmail,
    isProfileJobDueNow,
  }
) {
  /**
   * Marketing watchdog: per business profile, recomputes blended marketing
   * performance from its connected ad/store accounts and emails an alert when
   * ad spend is running underwater (ROAS < 1×) or campaigns run while the store
   * is out of stock. Reuses the exact same gathering as the Marketing page, so
   * the alert and the dashboard never disagree. No-ops without email config.
   */
  app.get("/api/cron/marketing-alerts", withRunRecording("marketing-alerts", supabaseAdmin, async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !tokenStore) {
      return res.status(503).json({ error: "dependencies_not_configured" });
    }
    if (!isEmailConfigured()) {
      return res.json({ ok: true, skipped: "email_not_configured", sent: 0 });
    }

    const appUrl = baseUrl;
    const startedAt = Date.now();
    const timeBudgetMs = 50_000;

    try {
      // Only profiles that opted into marketing alerts on the Company page.
      const { data: optedIn, error: settingsError } = await supabaseAdmin
        .from("automation_settings")
        .select("business_profile_id,notification_email,job_schedules,marketing_alerts_enabled")
        .eq("marketing_alerts_enabled", true);
      if (settingsError) {
        console.error("[cron] marketing-alerts settings select failed:", settingsError.message);
        return res.status(500).json({ error: "settings_load_failed" });
      }
      const optedInEmails = new Map(
        (Array.isArray(optedIn) ? optedIn : []).map((r) => [
          String(r.business_profile_id),
          { email: String(r.notification_email || ""), row: r },
        ]),
      );
      if (optedInEmails.size === 0) {
        return res.json({ ok: true, sent: 0, note: "no_profiles_opted_in" });
      }

      // Group the user's ad/store accounts by business profile (opted-in only).
      const byProfile = new Map();
      for (const [, rawStored] of await tokenStore.entries()) {
        const stored = rawStored || {};
        const platform = String(stored.platform || "");
        if (platform !== "meta_business" && platform !== "google_ads" && platform !== "shopify") continue;
        const pid = String(stored.profileId || "").trim();
        if (!pid || !optedInEmails.has(pid)) continue;
        if (!byProfile.has(pid)) byProfile.set(pid, { meta: [], google: [], shopify: null });
        const bucket = byProfile.get(pid);
        if (platform === "meta_business") bucket.meta.push(stored);
        else if (platform === "google_ads") bucket.google.push(stored);
        else if (platform === "shopify" && !bucket.shopify) bucket.shopify = stored;
      }

      const graphVersion = readMetaGraphVersion();
      const googleAdsConfig = readGoogleAdsConfig();
      let sent = 0;
      let noAlert = 0;
      let skippedNoRecipient = 0;
      let skippedForSchedule = 0;
      let failed = 0;
      let deferred = 0;
      const cronNow = new Date();

      for (const [profileId, accounts] of byProfile) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const settingsEntry = optedInEmails.get(profileId);
        if (!settingsEntry || !isProfileJobDueNow(settingsEntry.row, "marketing-alerts", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
        // Need at least one ad platform for a campaign/ROAS signal.
        if (accounts.meta.length === 0 && accounts.google.length === 0) {
          noAlert += 1;
          continue;
        }

        try {
          const data = await gatherMarketingData(accounts, { graphVersion, googleAdsConfig });

          const { data: priorSnaps } = await supabaseAdmin
            .from("marketing_snapshots")
            .select("snapshot_date, portfolio_score")
            .eq("business_profile_id", profileId)
            .order("snapshot_date", { ascending: false })
            .limit(14);
          const portfolioScoreDelta = portfolioScoreDeltaFromSnapshots(
            (Array.isArray(priorSnaps) ? priorSnaps : []).map((r) => ({
              snapshotDate: String(r.snapshot_date || ""),
              portfolioScore: r.portfolio_score == null ? null : Number(r.portfolio_score),
            })),
          );

          const poorCampaigns = extractPoorCampaignsForAlert(data.platforms);
          const alert = buildMarketingAlert({
            businessName: "Your business",
            appUrl: appUrl || undefined,
            currency: data.performance.adSpendCurrency || data.performance.revenueCurrency,
            roas: data.performance.roas,
            adSpend: data.performance.adSpend,
            revenue: data.performance.revenue,
            portfolioGrade: data.analytics?.portfolioGrade ?? null,
            portfolioScore: data.analytics?.portfolioScore ?? null,
            portfolioScoreDelta,
            campaignsPoor: data.analytics?.campaignsPoor ?? 0,
            poorCampaigns,
            recommendations: data.analytics?.recommendations ?? [],
            inventory: data.inventoryAlert,
          });
          if (!alert.hasAlert) {
            noAlert += 1;
            continue;
          }

          const { data: profile } = await supabaseAdmin
            .from("business_profiles")
            .select("id,name,email,owner_user_id")
            .eq("id", profileId)
            .maybeSingle();
          if (!profile) {
            skippedNoRecipient += 1;
            continue;
          }
          const recipient = await resolveRecipientEmail(supabaseAdmin, profile, settingsEntry.email);
          if (!recipient) {
            skippedNoRecipient += 1;
            continue;
          }

          // Re-render with the real business name now that we have it.
          const named = buildMarketingAlert({
            businessName: String(profile.name || "Your business"),
            appUrl: appUrl || undefined,
            currency: data.performance.adSpendCurrency || data.performance.revenueCurrency,
            roas: data.performance.roas,
            adSpend: data.performance.adSpend,
            revenue: data.performance.revenue,
            portfolioGrade: data.analytics?.portfolioGrade ?? null,
            portfolioScore: data.analytics?.portfolioScore ?? null,
            portfolioScoreDelta,
            campaignsPoor: data.analytics?.campaignsPoor ?? 0,
            poorCampaigns,
            recommendations: data.analytics?.recommendations ?? [],
            inventory: data.inventoryAlert,
          });
          const result = await sendEmail({
            to: recipient,
            subject: named.subject,
            html: named.html,
            text: named.text,
          });
          if (result.ok) {
            sent += 1;
            // Record it so the alert also shows in the notifications bell / Activity.
            void logActivity(supabaseAdmin, {
              businessProfileId: profileId,
              module: "marketing",
              eventType: "marketing.alert",
              severity: "warning",
              summary: named.reasons[0] || "Marketing needs attention",
              payload: { reasons: named.reasons },
            });
          } else {
            failed += 1;
          }
        } catch (err) {
          failed += 1;
          console.warn(
            `[cron] marketing-alerts profile=${profileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(
        `[cron] marketing-alerts: profiles=${byProfile.size} sent=${sent} noAlert=${noAlert} noRecipient=${skippedNoRecipient} skippedForSchedule=${skippedForSchedule} failed=${failed} deferred=${deferred}`,
      );
      return res.json({ ok: true, sent, noAlert, skippedNoRecipient, skippedForSchedule, failed, deferred });
    } catch (e) {
      console.error("[cron] marketing-alerts unexpected:", e?.message || e);
      return res.status(500).json({ error: "marketing_alerts_failed" });
    }
  }));
}
