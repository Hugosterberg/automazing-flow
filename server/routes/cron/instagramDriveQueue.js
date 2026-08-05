/**
 * Cron job: enqueue one Instagram image/day from a Google Drive to-post folder.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runInstagramDriveQueue } from "../../lib/instagramDriveQueue.ts";

export function registerInstagramDriveQueueCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    baseUrl,
    secretResolver,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  }
) {
  app.get(
    "/api/cron/instagram-drive-queue",
    withRunRecording("instagram-drive-queue", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !tokenStore) {
        return res.status(503).json({ error: "dependencies_not_configured" });
      }

      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();
      const publicBaseUrl = String(baseUrl || "").replace(/\/$/, "");
      if (!publicBaseUrl) {
        return res.status(503).json({ error: "base_url_not_configured" });
      }

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["instagram-drive-queue"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "instagram-drive-queue", cronNow)) continue;
          eligible.push(bpId);
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, enqueued: 0, note: "no_profiles_due" });
        }

        let enqueued = 0;
        let skipped = 0;
        let failed = 0;
        let deferred = 0;

        for (const bpId of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          try {
            const openaiKey = secretResolver
              ? await secretResolver.resolve(bpId, "OPENAI_API_KEY")
              : process.env.OPENAI_API_KEY;
            const result = await runInstagramDriveQueue({
              supabaseAdmin,
              tokenStore,
              businessProfileId: bpId,
              publicBaseUrl,
              now: cronNow,
              openaiKey: openaiKey || process.env.OPENAI_API_KEY || null,
            });
            if (result.enqueued > 0) enqueued += result.enqueued;
            else if (result.error) failed += 1;
            else skipped += 1;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] instagram-drive-queue bp=${bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }

        return res.json({ ok: true, enqueued, skipped, failed, deferred });
      } catch (e) {
        console.error("[cron] instagram-drive-queue unexpected:", e?.message || e);
        return res.status(500).json({ error: "instagram_drive_queue_failed" });
      }
    })
  );
}
