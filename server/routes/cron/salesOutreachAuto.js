/**
 * Cron job: drafts follow-up copy for due leads into outreach-queue.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runSalesOutreachAuto, runStaleLeadOutreach } from "../../lib/flowAutomationJobs.ts";

export function registerSalesOutreachAutoCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  }
) {
  /** Sales outreach auto: drafts follow-up copy for due leads into outreach-queue. */
  app.get(
    "/api/cron/sales-outreach-auto",
    withRunRecording("sales-outreach-auto", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });

      const appUrl = String(process.env.BASE_URL || process.env.VITE_APP_URL || "")
        .trim()
        .replace(/\/$/, "");
      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();
      const endOfToday = new Date(cronNow);
      endOfToday.setHours(23, 59, 59, 999);

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["sales-outreach-auto"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "sales-outreach-auto", cronNow)) continue;
          eligible.push({ bpId, email: settings.notificationEmail, schedules: settings.jobSchedules });
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, drafted: 0, note: "no_profiles_due" });
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

        let drafted = 0;
        let notified = 0;
        let failed = 0;
        let deferred = 0;

        for (const entry of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          const profile = profileById.get(entry.bpId);
          if (!profile) continue;
          try {
            const recipient = await resolveRecipientEmail(supabaseAdmin, profile, entry.email);
            const result = await runSalesOutreachAuto({
              supabaseAdmin,
              businessProfileId: entry.bpId,
              profile,
              schedules: entry.schedules,
              endOfToday,
              notifyEmail: recipient || undefined,
              appUrl: appUrl || undefined,
            });
            drafted += result.drafted;
            if (result.notified) notified += 1;
            const stale = await runStaleLeadOutreach({
              supabaseAdmin,
              businessProfileId: entry.bpId,
              profile,
              notifyEmail: recipient || undefined,
              appUrl: appUrl || undefined,
            });
            drafted += stale.drafted;
            if (stale.notified) notified += 1;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] sales-outreach-auto bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, drafted, notified, failed, deferred });
      } catch (e) {
        console.error("[cron] sales-outreach-auto unexpected:", e?.message || e);
        return res.status(500).json({ error: "sales_outreach_auto_failed" });
      }
    })
  );
}
