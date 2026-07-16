/**
 * Cron job: engagement follow-up email when unread DMs pile up.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { isEmailConfigured } from "../../lib/email.ts";
import { runEngagementFollowup } from "../../lib/engagementFollowup.ts";

export function registerEngagementFollowupCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    isSocialWorkflowEnabled,
    resolveRecipientEmail,
  }
) {
  app.get(
    "/api/cron/engagement-followup",
    withRunRecording("engagement-followup", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !zernio) return res.status(503).json({ error: "dependencies_not_configured" });
      if (!isEmailConfigured()) return res.json({ ok: true, skipped: "email_not_configured", emailed: 0 });

      const appUrl = String(process.env.BASE_URL || process.env.VITE_APP_URL || "")
        .trim()
        .replace(/\/$/, "");
      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["engagement-followup"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "engagement-followup", cronNow)) continue;
          if (!(await isSocialWorkflowEnabled(supabaseAdmin, bpId, "engagement-followup"))) continue;
          eligible.push({ bpId, email: settings.notificationEmail });
        }
        if (eligible.length === 0) return res.json({ ok: true, emailed: 0, note: "no_profiles_due" });

        const { data: profiles } = await supabaseAdmin
          .from("business_profiles")
          .select("id,name,email,owner_user_id,zernio_profile_id")
          .eq("status", "active")
          .in(
            "id",
            eligible.map((e) => e.bpId)
          );
        const profileById = new Map(
          (Array.isArray(profiles) ? profiles : []).map((p) => [String(p.id), p])
        );

        let emailed = 0;
        let unreadTotal = 0;
        let failed = 0;
        let deferred = 0;

        for (const entry of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          const profile = profileById.get(entry.bpId);
          const zernioProfileId = profile?.zernio_profile_id ? String(profile.zernio_profile_id) : "";
          if (!profile || !zernioProfileId) continue;
          try {
            const recipient = await resolveRecipientEmail(supabaseAdmin, profile, entry.email);
            const result = await runEngagementFollowup({
              supabaseAdmin,
              zernio,
              businessProfileId: entry.bpId,
              profileName: String(profile.name || "Your business"),
              zernioProfileId,
              notifyEmail: recipient || undefined,
              appUrl: appUrl || undefined,
            });
            unreadTotal += result.unread;
            if (result.emailed) emailed += 1;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] engagement-followup bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, emailed, unreadTotal, failed, deferred });
      } catch (e) {
        console.error("[cron] engagement-followup unexpected:", e?.message || e);
        return res.status(500).json({ error: "engagement_followup_failed" });
      }
    })
  );
}
