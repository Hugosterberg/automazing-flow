/**
 * Cron job: emails when open leads have overdue or due-today follow-ups.
 * Opt-in via job_schedules.lead-reminder.enabled.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { sendEmail, isEmailConfigured } from "../../lib/email.ts";
import { buildLeadReminder } from "../../lib/reminderEmails.ts";

export function registerLeadReminderCron(
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
  /** Lead follow-up reminder: emails when open leads have overdue or due-today follow-ups. */
  app.get(
    "/api/cron/lead-reminder",
    withRunRecording("lead-reminder", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
      if (!isEmailConfigured()) return res.json({ ok: true, skipped: "email_not_configured", sent: 0 });

      const appUrl = String(process.env.BASE_URL || process.env.VITE_APP_URL || "")
        .trim()
        .replace(/\/$/, "");
      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();
      const endOfToday = new Date(cronNow);
      endOfToday.setHours(23, 59, 59, 999);
      const startOfToday = new Date(cronNow);
      startOfToday.setHours(0, 0, 0, 0);

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["lead-reminder"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "lead-reminder", cronNow)) continue;
          eligible.push({ bpId, email: settings.notificationEmail, row });
        }
        if (eligible.length === 0) {
          return res.json({ ok: true, sent: 0, note: "no_profiles_due" });
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
        let sent = 0;
        let skippedEmpty = 0;
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
            const { data: leadRows } = await supabaseAdmin
              .from("leads")
              .select("name,status,next_follow_up_at")
              .eq("business_profile_id", entry.bpId)
              .in("status", ["new", "contacted", "qualified"])
              .not("next_follow_up_at", "is", null)
              .lte("next_follow_up_at", endOfToday.toISOString());
            const overdue = [];
            const dueToday = [];
            for (const l of Array.isArray(leadRows) ? leadRows : []) {
              if (!l?.next_follow_up_at) continue;
              const due = new Date(l.next_follow_up_at);
              const item = { name: String(l.name || "Lead"), status: String(l.status || "") };
              if (due < startOfToday) overdue.push(item);
              else dueToday.push(item);
            }
            const mail = buildLeadReminder({
              businessName: String(profile.name || "Your business"),
              appUrl: appUrl || undefined,
              overdue,
              dueToday,
            });
            if (!mail.hasContent) {
              skippedEmpty += 1;
              continue;
            }
            const recipient = await resolveRecipientEmail(supabaseAdmin, profile, entry.email);
            if (!recipient) continue;
            const result = await sendEmail({
              to: recipient,
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
            });
            if (result.ok) sent += 1;
            else failed += 1;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] lead-reminder bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, sent, skippedEmpty, failed, deferred });
      } catch (e) {
        console.error("[cron] lead-reminder unexpected:", e?.message || e);
        return res.status(500).json({ error: "lead_reminder_failed" });
      }
    })
  );
}
