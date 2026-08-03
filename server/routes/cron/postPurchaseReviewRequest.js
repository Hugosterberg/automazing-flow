/**
 * Cron job: emails customers a review-request a couple of weeks after a
 * fulfilled Shopify order (deduped per order).
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { isEmailConfigured } from "../../lib/email.ts";
import { runPostPurchaseReviewRequest } from "../../lib/flowAutomationJobs.ts";
import { judgemeCredentialsFromStored } from "../../providers/judgeme.ts";

export function registerPostPurchaseReviewRequestCron(
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
    "/api/cron/post-purchase-review-request",
    withRunRecording("post-purchase-review-request", supabaseAdmin, async (req, res) => {
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
          if (!settings.jobSchedules["post-purchase-review-request"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "post-purchase-review-request", cronNow)) continue;
          eligible.push({ bpId });
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, emailed: 0, note: "no_profiles_due" });
        }

        const { data: accountRows } = await supabaseAdmin
          .from("connected_accounts")
          .select("id,business_profile_id,platform,disconnected_at")
          .in("platform", ["shopify", "judgeme"])
          .is("disconnected_at", null)
          .in(
            "business_profile_id",
            eligible.map((e) => e.bpId)
          );

        const shopifyByProfile = new Map();
        const judgemeByProfile = new Map();
        for (const row of Array.isArray(accountRows) ? accountRows : []) {
          const bpId = String(row?.business_profile_id || "").trim();
          if (!bpId) continue;
          if (row.platform === "shopify" && !shopifyByProfile.has(bpId)) {
            shopifyByProfile.set(bpId, String(row.id));
          }
          if (row.platform === "judgeme" && !judgemeByProfile.has(bpId)) {
            judgemeByProfile.set(bpId, String(row.id));
          }
        }

        // Without email transport we can still serve profiles where Judge.me
        // sends the request; profiles without Judge.me are skipped as before.
        if (!isEmailConfigured() && judgemeByProfile.size === 0) {
          return res.json({ ok: true, skipped: "email_not_configured", emailed: 0 });
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

        let emailed = 0;
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
            let judgeme = null;
            const judgemeAccountId = judgemeByProfile.get(entry.bpId);
            if (judgemeAccountId) {
              const judgemeStored = await tokenStore.get(judgemeAccountId);
              judgeme = judgemeCredentialsFromStored(judgemeStored);
            }
            if (!judgeme && !isEmailConfigured()) {
              skipped += 1;
              continue;
            }
            const result = await runPostPurchaseReviewRequest({
              supabaseAdmin,
              businessProfileId: entry.bpId,
              profile,
              accessToken,
              shop,
              storefrontUrl: `https://${shop}`,
              judgeme,
            });
            emailed += result.emailed;
            skipped += result.skipped;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] post-purchase-review-request bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, emailed, skipped, failed, deferred });
      } catch (e) {
        console.error("[cron] post-purchase-review-request unexpected:", e?.message || e);
        return res.status(500).json({ error: "post_purchase_review_request_failed" });
      }
    })
  );
}
