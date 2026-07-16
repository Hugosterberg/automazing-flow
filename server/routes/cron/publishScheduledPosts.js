/**
 * Cron job: publish due scheduled posts via Zernio.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { isJobEnabledForProfile } from "../../lib/profileJobSchedule.ts";
import { publishDueScheduledPosts } from "../../lib/scheduledPostsPublisher.ts";

export function registerPublishScheduledPostsCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    tokenStore,
    loadAllAutomationSettings,
  }
) {
  /**
   * Scheduled-post publisher: sweeps every profile's "scheduled-posts"
   * document and publishes due posts via Zernio (publishNow). Posts keep
   * living in the document until this sweep fires, which is what makes them
   * reschedulable from the Calendar. Runs every 15 minutes; no per-profile
   * schedule gate — each post carries its own explicit publish time.
   */
  app.get(
    "/api/cron/publish-scheduled-posts",
    withRunRecording("publish-scheduled-posts", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!supabaseAdmin || !zernio || !tokenStore) {
        return res.status(503).json({ error: "dependencies_not_configured" });
      }
      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const result = await publishDueScheduledPosts({
          supabaseAdmin,
          zernio,
          tokenStore,
          shouldPublishForProfile: (businessProfileId) => {
            const row = settingsByProfile.get(businessProfileId);
            if (!row) return true;
            const settings = automationSettingsRowToDomain(row);
            return isJobEnabledForProfile("publish-scheduled-posts", settings.jobSchedules);
          },
        });
        console.log(
          `[cron] publish-scheduled-posts: profiles=${result.profiles} due=${result.due} published=${result.published} failed=${result.failed}`
        );
        return res.json({ ok: true, ...result });
      } catch (e) {
        console.error("[cron] publish-scheduled-posts unexpected:", e?.message || e);
        return res.status(500).json({ error: "publish_scheduled_posts_failed" });
      }
    })
  );
}
