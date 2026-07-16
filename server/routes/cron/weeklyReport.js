/**
 * Cron job: weekly performance report email.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { sendEmail, isEmailConfigured } from "../../lib/email.ts";
import { buildWeeklyReport } from "../../lib/weeklyReport.ts";

export function registerWeeklyReportCron(
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
  /**
   * Weekly performance report: a Monday recap (marketing trend, leads won/new,
   * follow-ups due, tasks completed) emailed to profiles opted into the daily
   * digest. No-ops without email config / opted-in profiles.
   */
  app.get("/api/cron/weekly-report", withRunRecording("weekly-report", supabaseAdmin, async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "supabase_service_role_not_configured" });
    }
    if (!isEmailConfigured()) {
      return res.json({ ok: true, skipped: "email_not_configured", sent: 0 });
    }

    const appUrl = String(process.env.BASE_URL || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "");
    const nowMs = Date.now();
    const weekAgoIso = new Date(nowMs - 7 * 86400000).toISOString();
    const endOfToday = new Date(nowMs);
    endOfToday.setHours(23, 59, 59, 999);
    const startedAt = Date.now();
    const timeBudgetMs = 50_000;

    try {
      const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
      const optedInEmails = new Map();
      for (const [bpId, row] of settingsByProfile) {
        const settings = automationSettingsRowToDomain(row);
        if (!settings.jobSchedules["weekly-report"]?.enabled) continue;
        optedInEmails.set(bpId, {
          email: settings.notificationEmail,
          row,
        });
      }
      if (optedInEmails.size === 0) {
        return res.json({ ok: true, sent: 0, note: "no_profiles_opted_in" });
      }

      const { data: profiles } = await supabaseAdmin
        .from("business_profiles")
        .select("id,name,email,owner_user_id")
        .eq("status", "active")
        .in("id", Array.from(optedInEmails.keys()));

      let sent = 0;
      let skippedEmpty = 0;
      let skippedNoRecipient = 0;
      let skippedForSchedule = 0;
      let failed = 0;
      let deferred = 0;
      const cronNow = new Date();

      for (const profile of Array.isArray(profiles) ? profiles : []) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const bpId = String(profile?.id || "");
        const settingsEntry = optedInEmails.get(bpId);
        if (!settingsEntry || !isProfileJobDueNow(settingsEntry.row, "weekly-report", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
        try {
          // Leads won/new this week + open follow-ups due.
          const { data: wonRows } = await supabaseAdmin
            .from("leads")
            .select("id", { count: "exact", head: false })
            .eq("business_profile_id", bpId)
            .eq("status", "won")
            .gte("updated_at", weekAgoIso);
          const { data: newRows } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("business_profile_id", bpId)
            .gte("created_at", weekAgoIso);
          const { data: followUpRows } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("business_profile_id", bpId)
            .in("status", ["new", "contacted", "qualified"])
            .not("next_follow_up_at", "is", null)
            .lte("next_follow_up_at", endOfToday.toISOString());

          // Tasks completed this week.
          const { data: doneRows } = await supabaseAdmin
            .from("tasks")
            .select("id")
            .eq("business_profile_id", bpId)
            .eq("status", "done")
            .gte("completed_at", weekAgoIso);

          // Marketing trend from snapshots (latest vs ~7 days back).
          const { data: snaps } = await supabaseAdmin
            .from("marketing_snapshots")
            .select("snapshot_date,ad_spend,revenue,roas,currency")
            .eq("business_profile_id", bpId)
            .order("snapshot_date", { ascending: false })
            .limit(14);
          const snapshots = Array.isArray(snaps) ? snaps : [];
          const current = snapshots[0] || null;
          let previous = null;
          if (current) {
            let best = Infinity;
            for (const s of snapshots.slice(1)) {
              const gap = Math.abs((Date.parse(current.snapshot_date) - Date.parse(s.snapshot_date)) / 86400000);
              if (gap < 4 || gap > 10) continue;
              const dist = Math.abs(gap - 7);
              if (dist < best) {
                best = dist;
                previous = s;
              }
            }
          }

          const report = buildWeeklyReport({
            businessName: String(profile.name || "Your business"),
            appUrl: appUrl || undefined,
            currency: current?.currency || null,
            roasCurrent: current?.roas != null ? Number(current.roas) : null,
            roasPrevious: previous?.roas != null ? Number(previous.roas) : null,
            spendThisWeek: current?.ad_spend != null ? Number(current.ad_spend) : null,
            revenueThisWeek: current?.revenue != null ? Number(current.revenue) : null,
            leadsWon: Array.isArray(wonRows) ? wonRows.length : 0,
            leadsNew: Array.isArray(newRows) ? newRows.length : 0,
            followUpsDue: Array.isArray(followUpRows) ? followUpRows.length : 0,
            tasksCompleted: Array.isArray(doneRows) ? doneRows.length : 0,
          });

          if (!report.hasContent) {
            skippedEmpty += 1;
            continue;
          }
          const recipient = await resolveRecipientEmail(supabaseAdmin, profile, settingsEntry.email);
          if (!recipient) {
            skippedNoRecipient += 1;
            continue;
          }
          const result = await sendEmail({ to: recipient, subject: report.subject, html: report.html, text: report.text });
          if (result.ok) sent += 1;
          else failed += 1;
        } catch (err) {
          failed += 1;
          console.warn(`[cron] weekly-report bp=${bpId} failed:`, err instanceof Error ? err.message : String(err));
        }
      }

      console.log(`[cron] weekly-report: sent=${sent} emptyQuiet=${skippedEmpty} noRecipient=${skippedNoRecipient} skippedForSchedule=${skippedForSchedule} failed=${failed} deferred=${deferred}`);
      return res.json({ ok: true, sent, skippedEmpty, skippedNoRecipient, skippedForSchedule, failed, deferred });
    } catch (e) {
      console.error("[cron] weekly-report unexpected:", e?.message || e);
      return res.status(500).json({ error: "weekly_report_failed" });
    }
  }));
}
