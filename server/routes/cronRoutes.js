/**
 * Scheduled / on-demand maintenance (Vercel Cron, manual curl, etc.).
 */

/**
 * @param {import("express").Express} app
 * @param {{
 *   oauthPendingStore: { deleteExpired?: () => Promise<{ removed: number }> };
 * }} deps
 */
export function registerCronRoutes(app, deps) {
  const { oauthPendingStore } = deps;

  /**
   * Vercel Cron sends: Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
   * Optional same check for manual runs with curl.
   */
  app.get("/api/cron/cleanup-oauth-pending", async (req, res) => {
    const secret = String(process.env.CRON_SECRET || "").trim();
    const auth = String(req.headers.authorization || "").trim();
    const expected = secret ? `Bearer ${secret}` : "";
    if (!secret || auth !== expected) {
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
  });
}
