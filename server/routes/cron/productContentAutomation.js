/**
 * Cron job: drafts AI-improved descriptions/tags for thin Shopify-synced
 * product listings, queued for approval (never writes without one).
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runProductContentAutomation } from "../../lib/productContentJobs.ts";

export function registerProductContentAutomationCron(
  app,
  { withRunRecording, isAuthorisedCron, supabaseAdmin, secretResolver, loadAllAutomationSettings, isProfileJobDueNow }
) {
  app.get(
    "/api/cron/product-content-automation",
    withRunRecording("product-content-automation", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !secretResolver) {
        return res.status(503).json({ error: "dependencies_not_configured" });
      }

      const cronNow = new Date();
      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["product-content-automation"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "product-content-automation", cronNow)) continue;
          eligible.push(bpId);
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, drafted: 0, note: "no_profiles_due" });
        }

        let drafted = 0;
        let skipped = 0;
        let failed = 0;
        for (const bpId of eligible) {
          try {
            const result = await runProductContentAutomation({
              supabaseAdmin,
              businessProfileId: bpId,
              resolveOpenAiKey: (id) => secretResolver.resolve(id, "OPENAI_API_KEY"),
            });
            drafted += result.drafted;
            skipped += result.skipped;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] product-content-automation bp=${bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, drafted, skipped, failed, profiles: eligible.length });
      } catch (e) {
        console.error("[cron] product-content-automation unexpected:", e?.message || e);
        return res.status(500).json({ error: "product_content_automation_failed" });
      }
    })
  );
}
