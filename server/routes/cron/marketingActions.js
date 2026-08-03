/**
 * Cron job: marketing campaign actions (pause / recommend) for Meta ads.
 */

import { automationSettingsRowToDomain } from "../../automation/autoReply.ts";
import { isEmailConfigured } from "../../lib/email.ts";
import { runMarketingActions } from "../../lib/marketingCampaignActions.ts";

export function registerMarketingActionsCron(
  app,
  {
    withRunRecording,
    baseUrl,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  }
) {
  app.get(
    "/api/cron/marketing-actions",
    withRunRecording("marketing-actions", supabaseAdmin, async (req, res) => {
      if (!isAuthorisedCron(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseAdmin || !tokenStore) return res.status(503).json({ error: "dependencies_not_configured" });
      if (!isEmailConfigured()) return res.json({ ok: true, skipped: "email_not_configured", paused: 0 });

      const appUrl = baseUrl;
      const startedAt = Date.now();
      const timeBudgetMs = 50_000;
      const cronNow = new Date();

      try {
        const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
        const eligible = [];
        for (const [bpId, row] of settingsByProfile) {
          const settings = automationSettingsRowToDomain(row);
          if (!settings.jobSchedules["marketing-actions"]?.enabled) continue;
          if (!isProfileJobDueNow(row, "marketing-actions", cronNow)) continue;
          eligible.push({ bpId, email: settings.notificationEmail });
        }
        if (eligible.length === 0) return res.json({ ok: true, paused: 0, note: "no_profiles_due" });

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

        let paused = 0;
        let recommended = 0;
        let failed = 0;
        let deferred = 0;

        for (const entry of eligible) {
          if (Date.now() - startedAt > timeBudgetMs) {
            deferred += 1;
            continue;
          }
          const profile = profileById.get(entry.bpId);
          if (!profile) continue;
          const { data: metaAccounts } = await supabaseAdmin
            .from("connected_accounts")
            .select("id")
            .eq("business_profile_id", entry.bpId)
            .eq("platform", "meta_business")
            .is("disconnected_at", null);
          const metaAccountIds = (Array.isArray(metaAccounts) ? metaAccounts : []).map((r) =>
            String(r.id)
          );
          if (metaAccountIds.length === 0) continue;
          try {
            const recipient = await resolveRecipientEmail(supabaseAdmin, profile, entry.email);
            const result = await runMarketingActions({
              supabaseAdmin,
              tokenStore,
              businessProfileId: entry.bpId,
              profileName: String(profile.name || "Your business"),
              metaAccountIds,
              notifyEmail: recipient || undefined,
              appUrl: appUrl || undefined,
            });
            paused += result.paused;
            recommended += result.recommended;
            failed += result.failed;
          } catch (err) {
            failed += 1;
            console.warn(
              `[cron] marketing-actions bp=${entry.bpId} failed:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        return res.json({ ok: true, paused, recommended, failed, deferred });
      } catch (e) {
        console.error("[cron] marketing-actions unexpected:", e?.message || e);
        return res.status(500).json({ error: "marketing_actions_failed" });
      }
    })
  );
}
