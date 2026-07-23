/**
 * Cron job: weekly insight digest email for social workflows.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { isEmailConfigured } from "../../lib/email.ts";
import { runWeeklyInsightDigest } from "../../lib/engagementFollowup.ts";

export function registerWeeklyInsightDigestCron(
  app,
  {
    withRunRecording,
    baseUrl,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    isSocialWorkflowEnabled,
    resolveRecipientEmail,
  }
) {
  app.get(
    "/api/cron/weekly-insight-digest",
    withRunRecording("weekly-insight-digest", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
      if (!isEmailConfigured()) return res.json({ ok: true, skipped: "email_not_configured", sent: 0 });

      const appUrl = baseUrl;
      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["weekly-insight-digest"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "weekly-insight-digest", cronNow)) continue;
          if (!(await isSocialWorkflowEnabled(supabaseAdmin, bpId, "weekly-insight-digest"))) continue;
          eligible.push({ bpId, email: settings.notificationEmail });
        }
        if (eligible.length === 0) return res.json({ ok: true, sent: 0, note: "no_profiles_due" });

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

        let sent = 0;
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
            if (!recipient) continue;
            const result = await runWeeklyInsightDigest({
              supabaseAdmin,
              businessProfileId: entry.bpId,
              profileName: String(profile.name || "Your business"),
              notifyEmail: recipient,
              appUrl: appUrl || undefined,
            });
            if (result.sent) sent += 1;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] weekly-insight-digest bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, sent, failed, deferred });
      } catch (e) {
        console.error("[cron] weekly-insight-digest unexpected:", e?.message || e);
        return res.status(500).json({ error: "weekly_insight_digest_failed" });
      }
    })
  );
}
