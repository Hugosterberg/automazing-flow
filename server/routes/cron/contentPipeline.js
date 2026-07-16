/**
 * Cron job: move queued content into scheduled-posts.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runContentPipeline } from "../../lib/flowAutomationJobs.ts";

export function registerContentPipelineCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  }
) {
  /** Content pipeline: moves queued content into scheduled-posts for publishing. */
  app.get(
    "/api/cron/content-pipeline",
    withRunRecording("content-pipeline", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });

      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["content-pipeline"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "content-pipeline", cronNow)) continue;
          eligible.push({ bpId, schedules: settings.jobSchedules });
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, scheduled: 0, note: "no_profiles_due" });
        }

        const { data: profiles } = await supabaseAdmin
          .from("business_profiles")
          .select("id,name")
          .eq("status", "active")
          .in(
            "id",
            eligible.map((e) => e.bpId)
          );
        const profileById = new Map(
          (Array.isArray(profiles) ? profiles : []).map((p) => [String(p.id), p])
        );

        let scheduled = 0;
        let skipped = 0;
        let failed = 0;
        let deferred = 0;

        for (const entry of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          try {
            const profile = profileById.get(entry.bpId);
            const result = await runContentPipeline({
              supabaseAdmin,
              businessProfileId: entry.bpId,
              schedules: entry.schedules,
              businessName: profile?.name ? String(profile.name) : undefined,
            });
            scheduled += result.scheduled;
            skipped += result.skipped;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] content-pipeline bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, scheduled, skipped, failed, deferred });
      } catch (e) {
        console.error("[cron] content-pipeline unexpected:", e?.message || e);
        return res.status(500).json({ error: "content_pipeline_failed" });
      }
    })
  );
}
