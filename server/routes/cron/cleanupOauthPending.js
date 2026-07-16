/**
 * Cron job: purge expired OAuth pending states.
 * Extracted from cronRoutes.js for smaller, reviewable modules.
 */

export function registerCleanupOauthPendingCron(app, { oauthPendingStore, withRunRecording, isAuthorisedCron, supabaseAdmin }) {
  app.get(
    "/api/cron/cleanup-oauth-pending",
    withRunRecording("cleanup-oauth-pending", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      try {
        const result = oauthPendingStore.deleteExpired
          ? await oauthPendingStore.deleteExpired()
          : { removed: 0 };
        return res.json({ ok: true, removed: result.removed ?? 0 });
      } catch (e) {
        console.error("[cron] cleanup-oauth-pending:", e?.message || e);
        return res.status(500).json({ error: "cleanup_failed" });
      }
    })
  );
}
