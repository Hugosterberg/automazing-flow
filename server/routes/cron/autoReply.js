/**
 * Cron job: DM auto-reply sweep across enabled profiles.
 */

import { runAutoReplyForAllProfiles } from "../../automation/autoReply.ts";

export function registerAutoReplyCron(app, { withRunRecording, isAuthorisedCron, supabaseAdmin, zernio, secretResolver }) {
  /**
   * Auto-reply automation sweep: for every business_profile with
   * `automation_settings.dm_auto_reply_enabled`, draft (or send, per the
   * profile's mode) AI replies to unread Zernio inbox conversations.
   * Idempotent via auto_reply_log — safe to trigger as often as you like
   * (Vercel Cron on Pro, or any external scheduler with the CRON_SECRET).
   */
  app.get(
    "/api/cron/auto-reply",
    withRunRecording("auto-reply", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!supabaseAdmin || !zernio || !secretResolver) {
        return res.status(503).json({ error: "auto_reply_dependencies_not_configured" });
      }

      try {
        const result = await runAutoReplyForAllProfiles({
          supabaseAdmin,
          zernio,
          resolveOpenAiKey: (bpId) => secretResolver.resolve(bpId, "OPENAI_API_KEY"),
        });
        const totals = result.summaries.reduce(
          (acc, s) => ({
            drafted: acc.drafted + s.drafted,
            sent: acc.sent + s.sent,
            failed: acc.failed + s.failed,
          }),
          { drafted: 0, sent: 0, failed: 0 }
        );
        console.log(
          `[cron] auto-reply: profiles=${result.profiles} drafted=${totals.drafted} sent=${totals.sent} failed=${totals.failed} skippedForTime=${result.skippedForTime} skippedForSchedule=${result.skippedForSchedule}`
        );
        return res.json({
          ok: true,
          profiles: result.profiles,
          skippedForTime: result.skippedForTime,
          skippedForSchedule: result.skippedForSchedule,
          ...totals,
          summaries: result.summaries,
        });
      } catch (e) {
        console.error("[cron] auto-reply unexpected:", e?.message || e);
        return res.status(500).json({ error: "auto_reply_failed" });
      }
    })
  );
}
