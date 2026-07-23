/**
 * Cron job: registers a Fortnox payment for invoices this app created once
 * the matching Shopify order shows as paid. Runs automatically (no approval
 * step) — see the comment on runFortnoxPaymentSync for why that's safe here.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runFortnoxPaymentSync } from "../../lib/fortnoxInvoiceJobs.ts";
import { getFreshFortnoxAccessToken } from "../../lib/fortnoxAuth.ts";

export function registerFortnoxPaymentSyncCron(
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
  app.get(
    "/api/cron/fortnox-payment-sync",
    withRunRecording("fortnox-payment-sync", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !tokenStore) {
        return res.status(503).json({ error: "dependencies_not_configured" });
      }

      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["fortnox-payment-sync"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "fortnox-payment-sync", cronNow)) continue;
          eligible.push(bpId);
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, paid: 0, note: "no_profiles_due" });
        }

        const { data: accountRows } = await supabaseAdmin
          .from("connected_accounts")
          .select("id,business_profile_id,platform,disconnected_at")
          .in("platform", ["shopify", "fortnox"])
          .is("disconnected_at", null)
          .in("business_profile_id", eligible);

        const shopifyByProfile = new Map();
        const fortnoxByProfile = new Map();
        for (const row of Array.isArray(accountRows) ? accountRows : []) {
          const bpId = String(row?.business_profile_id || "").trim();
          if (!bpId) continue;
          if (row.platform === "shopify" && !shopifyByProfile.has(bpId)) {
            shopifyByProfile.set(bpId, String(row.id));
          }
          if (row.platform === "fortnox" && !fortnoxByProfile.has(bpId)) {
            fortnoxByProfile.set(bpId, String(row.id));
          }
        }

        let paid = 0;
        let skipped = 0;
        let failed = 0;
        let deferred = 0;

        for (const bpId of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          const shopifyAccountId = shopifyByProfile.get(bpId);
          const fortnoxAccountId = fortnoxByProfile.get(bpId);
          if (!shopifyAccountId || !fortnoxAccountId) {
            skipped += 1;
            continue;
          }
          try {
            const shopifyStored = await tokenStore.get(shopifyAccountId);
            const shopifyAccessToken = String(shopifyStored?.accessToken || "").trim();
            const shop = String(shopifyStored?.shop || "").trim();
            const fortnoxStored = await tokenStore.get(fortnoxAccountId);
            if (!shopifyAccessToken || !shop || !fortnoxStored) {
              skipped += 1;
              continue;
            }
            const fortnoxAccessToken = await getFreshFortnoxAccessToken(tokenStore, fortnoxAccountId, fortnoxStored);
            if (!fortnoxAccessToken) {
              skipped += 1;
              continue;
            }
            const result = await runFortnoxPaymentSync({
              supabaseAdmin,
              businessProfileId: bpId,
              fortnoxAccessToken,
              shopifyAccessToken,
              shop,
            });
            paid += result.paid;
            skipped += result.skipped;
            failed += result.failed;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] fortnox-payment-sync bp=${bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, paid, skipped, failed, deferred });
      } catch (e) {
        console.error("[cron] fortnox-payment-sync unexpected:", e?.message || e);
        return res.status(500).json({ error: "fortnox_payment_sync_failed" });
      }
    })
  );
}
