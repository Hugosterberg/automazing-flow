/**
 * Cron job: refresh AI recommendations for every active business profile.
 * Extracted from cronRoutes.js for smaller, reviewable modules.
 */

import { generateAiRecommendations } from "../../ai/recommendations/producer.ts";

export function registerRefreshAiRecommendationsCron(
  app,
  { withRunRecording, isAuthorisedCron, supabaseAdmin, loadAllAutomationSettings, isProfileJobDueNow }
) {
  /**
   * Walks every active business_profile and re-runs the heuristic AI
   * recommendations producer. Complements the `connections/reconcile`
   * auto-trigger: reconcile only fires when a user clicks resync, while
   * this cron keeps stale_sync and overdue_task recs fresh even for
   * inactive tenants.
   *
   * Per-tenant failures are isolated — one bad bp cannot abort the run.
   * The response summarises what happened so cron logs are inspectable.
   */
  app.get(
    "/api/cron/refresh-ai-recommendations",
    withRunRecording("refresh-ai-recommendations", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "supabase_service_role_not_configured" });
      }

      try {
        const { data, error } = await supabaseAdmin
          .from("business_profiles")
          .select("id")
          .eq("status", "active");

        if (error) {
          console.error("[cron] refresh-ai-recommendations select failed:", error.message);
          return res.status(500).json({ error: "list_profiles_failed" });
        }

        const profiles = Array.isArray(data) ? data : [];
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const now = new Date();
        const summary = [];
        let totalCreated = 0;
        let totalExpired = 0;
        let failedTenants = 0;
        let skippedForSchedule = 0;

        for (const row of profiles) {
          const businessProfileId = String(row?.id || "").trim();
          if (!businessProfileId) continue;
          if (
            !isProfileJobDueNow(
              settingsByProfile.get(businessProfileId),
              "refresh-ai-recommendations",
              now
            )
          ) {
            skippedForSchedule += 1;
            continue;
          }
          try {
            const result = await generateAiRecommendations(supabaseAdmin, {
              businessProfileId,
            });
            totalCreated += result.created;
            totalExpired += result.expired;
            summary.push({
              businessProfileId,
              created: result.created,
              expired: result.expired,
              unchanged: result.unchanged,
              heuristicErrors: result.errors.length,
            });
          } catch (err) {
            failedTenants += 1;
            const message = err instanceof Error ? err.message : String(err);
            console.warn(
              `[cron] refresh-ai-recommendations bp=${businessProfileId} failed:`,
              message
            );
            summary.push({
              businessProfileId,
              error: message.slice(0, 200),
            });
          }
        }

        console.log(
          `[cron] refresh-ai-recommendations: scanned=${profiles.length} created=${totalCreated} expired=${totalExpired} failedTenants=${failedTenants} skippedForSchedule=${skippedForSchedule}`
        );

        return res.json({
          ok: true,
          scanned: profiles.length,
          created: totalCreated,
          expired: totalExpired,
          failedTenants,
          skippedForSchedule,
          summary,
        });
      } catch (e) {
        console.error("[cron] refresh-ai-recommendations unexpected:", e?.message || e);
        return res.status(500).json({ error: "refresh_failed" });
      }
    })
  );
}
