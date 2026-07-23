/**
 * Cron job: emails overdue and due-today open tasks.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { sendEmail, isEmailConfigured } from "../../lib/email.ts";
import { buildTaskReminder } from "../../lib/reminderEmails.ts";

export function registerTaskReminderCron(
  app,
  {
    withRunRecording,
    baseUrl,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  }
) {
  /** Task due reminder: emails overdue and due-today open tasks. */
  app.get(
    "/api/cron/task-reminder",
    withRunRecording("task-reminder", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
      if (!isEmailConfigured()) return res.json({ ok: true, skipped: "email_not_configured", sent: 0 });

      const appUrl = baseUrl;
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
          if (!settings.jobSchedules["task-reminder"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "task-reminder", cronNow)) continue;
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
            const { data: taskRows } = await supabaseAdmin
              .from("tasks")
              .select("title,due_at")
              .eq("business_profile_id", entry.bpId)
              .in("status", ["open", "in_progress", "blocked"])
              .not("due_at", "is", null)
              .lte("due_at", endOfToday.toISOString());
            const overdue = [];
            const dueToday = [];
            for (const t of Array.isArray(taskRows) ? taskRows : []) {
              if (!t?.due_at) continue;
              const due = new Date(t.due_at);
              const item = { title: String(t.title || "Task") };
              if (due < startOfToday) overdue.push(item);
              else dueToday.push(item);
            }
            const mail = buildTaskReminder({
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
              `[cron] task-reminder bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, sent, skippedEmpty, failed, deferred });
      } catch (e) {
        console.error("[cron] task-reminder unexpected:", e?.message || e);
        return res.status(500).json({ error: "task_reminder_failed" });
      }
    })
  );
}
