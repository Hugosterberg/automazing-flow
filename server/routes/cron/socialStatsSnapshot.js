/**
 * Cron job: daily social stats snapshot into social_stats_snapshots.
 */

import { buildSocialStatsSnapshotRow } from "../../lib/socialStatsSnapshots.ts";

export function registerSocialStatsSnapshotCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  }
) {
  /**
   * Daily social stats snapshot: copies each connected social/review account's
   * already-ingested stats (connected_accounts.stats) into
   * social_stats_snapshots, one row per account per day. Powers the
   * follower/engagement trends on the Social page. No provider calls — the
   * app's own ingested data is the source, so the job is cheap and idempotent.
   */
  app.get("/api/cron/social-stats-snapshot", withRunRecording("social-stats-snapshot", supabaseAdmin, async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "dependencies_not_configured" });
    }

    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data: accounts, error } = await supabaseAdmin
        .from("connected_accounts")
        .select("id,business_profile_id,platform,stats")
        .is("disconnected_at", null)
        .not("stats", "is", null)
        .not("business_profile_id", "is", null);
      if (error) {
        console.error("[cron] social-stats-snapshot select failed:", error.message);
        return res.status(500).json({ error: "social_stats_snapshot_failed" });
      }

      const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
      const cronNow = new Date();
      const dueByProfile = new Map();
      const rows = [];
      let skippedForSchedule = 0;
      let skippedNoMetrics = 0;
      for (const account of Array.isArray(accounts) ? accounts : []) {
        const profileId = String(account?.business_profile_id || "").trim();
        if (!profileId) continue;
        if (!dueByProfile.has(profileId)) {
          dueByProfile.set(
            profileId,
            isProfileJobDueNow(settingsByProfile.get(profileId), "social-stats-snapshot", cronNow),
          );
        }
        if (!dueByProfile.get(profileId)) {
          skippedForSchedule += 1;
          continue;
        }
        const row = buildSocialStatsSnapshotRow(account, today);
        if (row) rows.push(row);
        else skippedNoMetrics += 1;
      }

      let written = 0;
      if (rows.length > 0) {
        const { error: upsertErr } = await supabaseAdmin
          .from("social_stats_snapshots")
          .upsert(rows, { onConflict: "account_id,snapshot_date" });
        if (upsertErr) {
          console.error("[cron] social-stats-snapshot upsert failed:", upsertErr.message);
          return res.status(500).json({ error: "social_stats_snapshot_failed" });
        }
        written = rows.length;
      }

      console.log(
        `[cron] social-stats-snapshot: accounts=${(accounts || []).length} written=${written} skippedForSchedule=${skippedForSchedule} skippedNoMetrics=${skippedNoMetrics}`,
      );
      return res.json({ ok: true, written, skippedForSchedule, skippedNoMetrics });
    } catch (e) {
      console.error("[cron] social-stats-snapshot unexpected:", e?.message || e);
      return res.status(500).json({ error: "social_stats_snapshot_failed" });
    }
  }));
}
