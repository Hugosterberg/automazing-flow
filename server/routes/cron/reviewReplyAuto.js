/**
 * Cron job: draft public review replies into review-reply-queue (no auto-post).
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { runReviewReplyAuto } from "../../lib/flowAutomationJobs.ts";

export function registerReviewReplyAutoCron(
  app,
  {
    withRunRecording,
    baseUrl,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    tokenStore,
    secretResolver,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  }
) {
  /** Review reply auto: drafts public review replies into review-reply-queue (no auto-post). */
  app.get(
    "/api/cron/review-reply-auto",
    withRunRecording("review-reply-auto", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !zernio || !tokenStore) {
        return res.status(503).json({ error: "dependencies_not_configured" });
      }

      const appUrl = baseUrl;
      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["review-reply-auto"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "review-reply-auto", cronNow)) continue;
          eligible.push({ bpId, email: settings.notificationEmail, row });
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
        let urgentAlerts = 0;
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
            const openaiKey = secretResolver?.resolve
              ? await secretResolver.resolve(entry.bpId, "OPENAI_API_KEY")
              : process.env.OPENAI_API_KEY;
            const recipient = await resolveRecipientEmail(supabaseAdmin, profile, entry.email);
            const result = await runReviewReplyAuto({
              supabaseAdmin,
              tokenStore,
              zernio,
              businessProfileId: entry.bpId,
              profile,
              openaiKey: openaiKey || process.env.OPENAI_API_KEY || null,
              notifyEmail: recipient || undefined,
              appUrl: appUrl || undefined,
            });
            drafted += result.drafted;
            if (result.notified) notified += 1;
            urgentAlerts += result.urgentAlerts ?? 0;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] review-reply-auto bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, drafted, notified, urgentAlerts, failed, deferred });
      } catch (e) {
        console.error("[cron] review-reply-auto unexpected:", e?.message || e);
        return res.status(500).json({ error: "review_reply_auto_failed" });
      }
    })
  );
}
