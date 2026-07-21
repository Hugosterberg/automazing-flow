/**
 * Cron job: queues Fortnox invoice suggestions for paid + fulfilled Shopify
 * orders (never creates the invoice itself — see fortnoxInvoiceJobs.ts).
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runFortnoxInvoiceSuggest } from "../../lib/fortnoxInvoiceJobs.ts";

export function registerFortnoxInvoiceSuggestCron(
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
    "/api/cron/fortnox-invoice-suggest",
    withRunRecording("fortnox-invoice-suggest", supabaseAdmin, async (req, res) => {
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
          if (!settings.jobSchedules["fortnox-invoice-suggest"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "fortnox-invoice-suggest", cronNow)) continue;
          eligible.push(bpId);
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, queued: 0, note: "no_profiles_due" });
        }

        const { data: accountRows } = await supabaseAdmin
          .from("connected_accounts")
          .select("id,business_profile_id,platform,disconnected_at")
          .in("platform", ["shopify", "fortnox"])
          .is("disconnected_at", null)
          .in("business_profile_id", eligible);

        const shopifyByProfile = new Map();
        const hasFortnox = new Set();
        for (const row of Array.isArray(accountRows) ? accountRows : []) {
          const bpId = String(row?.business_profile_id || "").trim();
          if (!bpId) continue;
          if (row.platform === "shopify" && !shopifyByProfile.has(bpId)) {
            shopifyByProfile.set(bpId, String(row.id));
          }
          if (row.platform === "fortnox") hasFortnox.add(bpId);
        }

        let queued = 0;
        let skipped = 0;
        let failed = 0;
        let deferred = 0;

        for (const bpId of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          const accountId = shopifyByProfile.get(bpId);
          if (!accountId || !hasFortnox.has(bpId)) {
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
            const result = await runFortnoxInvoiceSuggest({
              supabaseAdmin,
              businessProfileId: bpId,
              accessToken,
              shop,
            });
            queued += result.queued;
            skipped += result.skipped;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] fortnox-invoice-suggest bp=${bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, queued, skipped, failed, deferred });
      } catch (e) {
        console.error("[cron] fortnox-invoice-suggest unexpected:", e?.message || e);
        return res.status(500).json({ error: "fortnox_invoice_suggest_failed" });
      }
    })
  );
}
