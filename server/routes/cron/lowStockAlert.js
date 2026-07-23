/**
 * Cron job: emails a digest when Shopify products go low/out of stock, with
 * a reorder link when the product traces back to an Alibaba/1688 import.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { isEmailConfigured } from "../../lib/email.ts";
import { runLowStockAlert } from "../../lib/lowStockAlertJobs.ts";

export function registerLowStockAlertCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  }
) {
  const appUrl = String(process.env.BASE_URL || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "");

  app.get(
    "/api/cron/low-stock-alert",
    withRunRecording("low-stock-alert", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !tokenStore) {
        return res.status(503).json({ error: "dependencies_not_configured" });
      }
      if (!isEmailConfigured()) return res.json({ ok: true, skipped: "email_not_configured", alerted: 0 });

      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["low-stock-alert"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "low-stock-alert", cronNow)) continue;
          eligible.push({ bpId, notificationEmail: settings.notificationEmail });
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, alerted: 0, note: "no_profiles_due" });
        }

        const { data: accountRows } = await supabaseAdmin
          .from("connected_accounts")
          .select("id,business_profile_id,platform,disconnected_at")
          .eq("platform", "shopify")
          .is("disconnected_at", null)
          .in(
            "business_profile_id",
            eligible.map((e) => e.bpId)
          );

        const shopifyByProfile = new Map();
        for (const row of Array.isArray(accountRows) ? accountRows : []) {
          const bpId = String(row?.business_profile_id || "").trim();
          if (bpId && !shopifyByProfile.has(bpId)) shopifyByProfile.set(bpId, String(row.id));
        }

        const { data: profiles } = await supabaseAdmin
          .from("business_profiles")
          .select("id,name,email,owner_user_id")
          .eq("status", "active")
          .in(
            "id",
            eligible.map((e) => e.bpId)
          );
        const profileById = new Map(
          (Array.isArray(profiles) ? profiles : []).map((p) => [String(p.id), p])
        );

        let alerted = 0;
        let notified = 0;
        let skipped = 0;
        let failed = 0;
        let deferred = 0;

        for (const entry of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          const accountId = shopifyByProfile.get(entry.bpId);
          const profile = profileById.get(entry.bpId);
          if (!accountId || !profile) {
            skipped += 1;
            continue;
          }
          try {
            const stored = await tokenStore.get(accountId);
            const accessToken = String(stored?.accessToken || "").trim();
            const shop = String(stored?.shop || "").trim();
            if (!accessToken || !shop) {
              skipped += 1;
              continue;
            }
            const recipient = await resolveRecipientEmail(supabaseAdmin, profile, entry.notificationEmail);
            const result = await runLowStockAlert({
              supabaseAdmin,
              businessProfileId: entry.bpId,
              businessName: String(profile.name || "din butik"),
              accessToken,
              shop,
              notifyEmail: recipient || undefined,
              appUrl: appUrl || undefined,
            });
            alerted += result.alerted;
            if (result.notified) notified += 1;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] low-stock-alert bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, alerted, notified, skipped, failed, deferred });
      } catch (e) {
        console.error("[cron] low-stock-alert unexpected:", e?.message || e);
        return res.status(500).json({ error: "low_stock_alert_failed" });
      }
    })
  );
}
