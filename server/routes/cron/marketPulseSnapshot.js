/**
 * Cron job: daily market pulse snapshot into intelligence_pulse_snapshots.
 */

import { fetchMarketPulseForCron, DEFAULT_MARKET_PULSE_TOPIC } from "../../lib/marketPulseFetch.ts";

export function registerMarketPulseSnapshotCron(
  app,
  {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  }
) {
  /**
   * Daily market pulse snapshot: LunarCrush sentiment per profile with a ready
   * account. Persists to intelligence_pulse_snapshots for fast home dashboard loads.
   */
  app.get("/api/cron/market-pulse-snapshot", withRunRecording("market-pulse-snapshot", supabaseAdmin, async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !tokenStore) {
      return res.status(503).json({ error: "dependencies_not_configured" });
    }

    const startedAt = Date.now();
    const timeBudgetMs = 50_000;
    const today = new Date().toISOString().slice(0, 10);
    const topic = DEFAULT_MARKET_PULSE_TOPIC;

    try {
      const profileIds = new Set();
      for (const [, rawStored] of await tokenStore.entries()) {
        const stored = rawStored || {};
        if (String(stored.platform || "") !== "lunarcrush") continue;
        const pid = String(stored.profileId || "").trim();
        if (pid) profileIds.add(pid);
      }

      let written = 0;
      let skipped = 0;
      let skippedForSchedule = 0;
      let deferred = 0;
      const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
      const cronNow = new Date();

      for (const profileId of profileIds) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        if (!isProfileJobDueNow(settingsByProfile.get(profileId), "market-pulse-snapshot", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
        try {
          const result = await fetchMarketPulseForCron({
            tokenStore,
            businessProfileId: profileId,
            topic,
          });
          if (!result.ok) {
            skipped += 1;
            continue;
          }
          const { error } = await supabaseAdmin.from("intelligence_pulse_snapshots").upsert(
            {
              business_profile_id: profileId,
              snapshot_date: today,
              topic: result.topic,
              provider: result.provider,
              tool: result.tool,
              text: result.text,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "business_profile_id,snapshot_date,topic" },
          );
          if (error) {
            skipped += 1;
            console.warn(`[cron] market-pulse-snapshot upsert failed profile=${profileId}:`, error.message);
          } else {
            written += 1;
          }
        } catch (err) {
          skipped += 1;
          console.warn(
            `[cron] market-pulse-snapshot profile=${profileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(
        `[cron] market-pulse-snapshot: profiles=${profileIds.size} written=${written} skipped=${skipped} skippedForSchedule=${skippedForSchedule} deferred=${deferred}`,
      );
      return res.json({ ok: true, written, skipped, skippedForSchedule, deferred });
    } catch (e) {
      console.error("[cron] market-pulse-snapshot unexpected:", e?.message || e);
      return res.status(500).json({ error: "market_pulse_snapshot_failed" });
    }
  }));
}
