/**
 * Scheduled / on-demand maintenance (Vercel Cron, manual curl, etc.).
 *
 * Every endpoint requires `Authorization: Bearer <CRON_SECRET>` — the same
 * header Vercel Cron sends automatically when `CRON_SECRET` is configured
 * on the project. When the secret is unset the endpoints fail closed (401)
 * so a half-deployed environment can't silently run housekeeping jobs.
 */

import crypto from "crypto";
import { generateAiRecommendations } from "../ai/recommendations/producer.ts";
import { runAutoReplyForAllProfiles } from "../automation/autoReply.ts";
import { buildDigest } from "../lib/digest.ts";
import { sendEmail, isEmailConfigured } from "../lib/email.ts";
import { buildMarketingAlert } from "../lib/marketingAlert.ts";
import { gatherMarketingData, readGoogleAdsConfig, readMetaGraphVersion } from "../lib/marketingData.ts";
import { logActivity } from "../lib/activityLog.ts";
import { buildWeeklyReport } from "../lib/weeklyReport.ts";

/**
 * Resolve where a profile's notifications go: the explicit notification email
 * chosen on the Company page, else the profile's contact email, else the
 * owner's login email.
 */
async function resolveRecipientEmail(supabaseAdmin, profile, overrideEmail) {
  const override = String(overrideEmail || "").trim();
  if (override) return override;
  const direct = String(profile?.email || "").trim();
  if (direct) return direct;
  const ownerId = profile?.owner_user_id ? String(profile.owner_user_id) : "";
  if (!ownerId) return "";
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    return String(data?.user?.email || "").trim();
  } catch {
    return "";
  }
}

/** Display label for a connection platform (digest copy). */
function platformLabel(platform) {
  const map = {
    instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X",
    facebook: "Facebook", google_business: "Google Business", google_ads: "Google Ads",
    meta_business: "Meta Business", google_reviews: "Google Reviews", tripadvisor: "Tripadvisor",
    whatsapp: "WhatsApp", shopify: "Shopify", notion: "Notion", gmail: "Gmail",
    outlook: "Outlook", google_calendar: "Google Calendar", outlook_calendar: "Outlook Calendar",
    google_drive: "Google Drive",
  };
  const key = String(platform || "").toLowerCase();
  return map[key] || (key ? key.replace(/_/g, " ") : "Connection");
}

/** Constant-time string comparison that never short-circuits on length. */
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) {
    // Still compare against a same-length buffer so the work (and timing)
    // does not leak the secret's length.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Guard: returns true when the incoming request is authorised to run a
 * cron job. Fails closed when CRON_SECRET is missing. Keeping this inline
 * (not a middleware) so each endpoint can own its own error envelope.
 */
function isAuthorisedCron(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = String(req.headers.authorization || "").trim();
  return timingSafeStringEqual(auth, `Bearer ${secret}`);
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   oauthPendingStore: { deleteExpired?: () => Promise<{ removed: number }> };
 *   supabaseAdmin?: unknown;
 *   zernio?: unknown;
 *   secretResolver?: { resolve: (businessProfileId: string, key: string) => Promise<string | null> };
 * }} deps
 */
export function registerCronRoutes(app, deps) {
  const { oauthPendingStore, supabaseAdmin, zernio, secretResolver, tokenStore } = deps;

  app.get("/api/cron/cleanup-oauth-pending", async (req, res) => {
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
  });

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
  app.get("/api/cron/refresh-ai-recommendations", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin) {
      return res
        .status(503)
        .json({ error: "supabase_service_role_not_configured" });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("business_profiles")
        .select("id")
        .eq("status", "active");

      if (error) {
        console.error(
          "[cron] refresh-ai-recommendations select failed:",
          error.message
        );
        return res.status(500).json({ error: "list_profiles_failed" });
      }

      const profiles = Array.isArray(data) ? data : [];
      const summary = [];
      let totalCreated = 0;
      let totalExpired = 0;
      let failedTenants = 0;

      for (const row of profiles) {
        const businessProfileId = String(row?.id || "").trim();
        if (!businessProfileId) continue;
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
        `[cron] refresh-ai-recommendations: scanned=${profiles.length} created=${totalCreated} expired=${totalExpired} failedTenants=${failedTenants}`
      );

      return res.json({
        ok: true,
        scanned: profiles.length,
        created: totalCreated,
        expired: totalExpired,
        failedTenants,
        summary,
      });
    } catch (e) {
      console.error(
        "[cron] refresh-ai-recommendations unexpected:",
        e?.message || e
      );
      return res.status(500).json({ error: "refresh_failed" });
    }
  });

  /**
   * Auto-reply automation sweep: for every business_profile with
   * `automation_settings.dm_auto_reply_enabled`, draft (or send, per the
   * profile's mode) AI replies to unread Zernio inbox conversations.
   * Idempotent via auto_reply_log — safe to trigger as often as you like
   * (Vercel Cron on Pro, or any external scheduler with the CRON_SECRET).
   */
  app.get("/api/cron/auto-reply", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !zernio || !secretResolver) {
      return res
        .status(503)
        .json({ error: "auto_reply_dependencies_not_configured" });
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
        `[cron] auto-reply: profiles=${result.profiles} drafted=${totals.drafted} sent=${totals.sent} failed=${totals.failed} skippedForTime=${result.skippedForTime}`
      );
      return res.json({
        ok: true,
        profiles: result.profiles,
        skippedForTime: result.skippedForTime,
        ...totals,
        summaries: result.summaries,
      });
    } catch (e) {
      console.error("[cron] auto-reply unexpected:", e?.message || e);
      return res.status(500).json({ error: "auto_reply_failed" });
    }
  });

  /**
   * Daily digest: emails each active business profile its morning brief
   * (connection issues, overdue/due-today tasks, fresh recommendations) so the
   * "check everything" task is automated. No-ops cleanly when email isn't
   * configured (RESEND_API_KEY). All-clear profiles are skipped — we only mail
   * when there's something to act on, so the inbox stays signal.
   */
  app.get("/api/cron/daily-digest", async (req, res) => {
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
    const startedAt = Date.now();
    const timeBudgetMs = 50_000;

    try {
      // Only profiles that opted in on the Company/Updates page.
      const { data: optedIn, error: settingsError } = await supabaseAdmin
        .from("automation_settings")
        .select("business_profile_id,notification_email")
        .eq("daily_digest_enabled", true);
      if (settingsError) {
        console.error("[cron] daily-digest settings select failed:", settingsError.message);
        return res.status(500).json({ error: "settings_load_failed" });
      }
      const optedInEmails = new Map(
        (Array.isArray(optedIn) ? optedIn : []).map((r) => [
          String(r.business_profile_id),
          String(r.notification_email || ""),
        ]),
      );
      if (optedInEmails.size === 0) {
        return res.json({ ok: true, sent: 0, note: "no_profiles_opted_in" });
      }

      const { data: profiles, error } = await supabaseAdmin
        .from("business_profiles")
        .select("id,name,email,owner_user_id")
        .eq("status", "active")
        .in("id", Array.from(optedInEmails.keys()));
      if (error) {
        console.error("[cron] daily-digest profiles select failed:", error.message);
        return res.status(500).json({ error: "list_profiles_failed" });
      }

      let sent = 0;
      let skippedEmpty = 0;
      let skippedNoRecipient = 0;
      let failed = 0;
      let deferred = 0;

      for (const profile of Array.isArray(profiles) ? profiles : []) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const businessProfileId = String(profile?.id || "").trim();
        if (!businessProfileId) continue;

        try {
          // Connection issues (anything not healthy/pending and still active).
          const { data: accounts } = await supabaseAdmin
            .from("connected_accounts")
            .select("platform,health,disconnected_at")
            .eq("business_profile_id", businessProfileId);
          const connectionIssues = (Array.isArray(accounts) ? accounts : [])
            .filter((a) => !a?.disconnected_at)
            .filter((a) => a?.health && a.health !== "healthy" && a.health !== "pending" && a.health !== "disconnected")
            .map((a) => ({ label: platformLabel(a.platform), health: String(a.health) }));

          // Open tasks with due dates → overdue vs due-today.
          const { data: taskRows } = await supabaseAdmin
            .from("tasks")
            .select("title,status,due_at")
            .eq("business_profile_id", businessProfileId)
            .in("status", ["open", "in_progress", "blocked"]);
          const now = new Date();
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date(now);
          endOfToday.setHours(23, 59, 59, 999);
          const overdueTasks = [];
          const dueTodayTasks = [];
          for (const t of Array.isArray(taskRows) ? taskRows : []) {
            if (!t?.due_at) continue;
            const due = new Date(t.due_at);
            if (Number.isNaN(due.getTime())) continue;
            if (due < startOfToday) overdueTasks.push({ title: String(t.title || "Task") });
            else if (due <= endOfToday) dueTodayTasks.push({ title: String(t.title || "Task") });
          }

          // Fresh recommendations.
          const { data: recRows } = await supabaseAdmin
            .from("ai_recommendations")
            .select("title,status")
            .eq("business_profile_id", businessProfileId)
            .in("status", ["new", "seen"]);
          const newRecommendations = (Array.isArray(recRows) ? recRows : []).map((r) => ({
            title: String(r?.title || "Recommendation"),
          }));

          // Open leads whose follow-up is overdue or due today (best-effort —
          // the table may not exist before its migration is applied).
          let leadsToFollowUp = 0;
          try {
            const { data: leadRows } = await supabaseAdmin
              .from("leads")
              .select("status,next_follow_up_at")
              .eq("business_profile_id", businessProfileId)
              .in("status", ["new", "contacted", "qualified"])
              .not("next_follow_up_at", "is", null)
              .lte("next_follow_up_at", endOfToday.toISOString());
            leadsToFollowUp = Array.isArray(leadRows) ? leadRows.length : 0;
          } catch {
            /* leads table not available yet */
          }

          const digest = buildDigest({
            businessName: String(profile.name || "Your business"),
            appUrl: appUrl || undefined,
            connectionIssues,
            leadsToFollowUp,
            overdueTasks,
            dueTodayTasks,
            newRecommendations,
          });

          if (!digest.hasContent) {
            skippedEmpty += 1;
            continue;
          }

          // Recipient: chosen notification email → profile email → owner email.
          const recipient = await resolveRecipientEmail(
            supabaseAdmin,
            profile,
            optedInEmails.get(businessProfileId),
          );
          if (!recipient) {
            skippedNoRecipient += 1;
            continue;
          }

          const result = await sendEmail({
            to: recipient,
            subject: digest.subject,
            html: digest.html,
            text: digest.text,
          });
          if (result.ok) sent += 1;
          else failed += 1;
        } catch (err) {
          failed += 1;
          console.warn(
            `[cron] daily-digest bp=${businessProfileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(
        `[cron] daily-digest: profiles=${(profiles || []).length} sent=${sent} emptyAllClear=${skippedEmpty} noRecipient=${skippedNoRecipient} failed=${failed} deferred=${deferred}`,
      );
      return res.json({ ok: true, sent, skippedEmpty, skippedNoRecipient, failed, deferred });
    } catch (e) {
      console.error("[cron] daily-digest unexpected:", e?.message || e);
      return res.status(500).json({ error: "daily_digest_failed" });
    }
  });

  /**
   * Marketing watchdog: per business profile, recomputes blended marketing
   * performance from its connected ad/store accounts and emails an alert when
   * ad spend is running underwater (ROAS < 1×) or campaigns run while the store
   * is out of stock. Reuses the exact same gathering as the Marketing page, so
   * the alert and the dashboard never disagree. No-ops without email config.
   */
  app.get("/api/cron/marketing-alerts", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !tokenStore) {
      return res.status(503).json({ error: "dependencies_not_configured" });
    }
    if (!isEmailConfigured()) {
      return res.json({ ok: true, skipped: "email_not_configured", sent: 0 });
    }

    const appUrl = String(process.env.BASE_URL || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "");
    const startedAt = Date.now();
    const timeBudgetMs = 50_000;

    try {
      // Only profiles that opted into marketing alerts on the Company page.
      const { data: optedIn, error: settingsError } = await supabaseAdmin
        .from("automation_settings")
        .select("business_profile_id,notification_email")
        .eq("marketing_alerts_enabled", true);
      if (settingsError) {
        console.error("[cron] marketing-alerts settings select failed:", settingsError.message);
        return res.status(500).json({ error: "settings_load_failed" });
      }
      const optedInEmails = new Map(
        (Array.isArray(optedIn) ? optedIn : []).map((r) => [
          String(r.business_profile_id),
          String(r.notification_email || ""),
        ]),
      );
      if (optedInEmails.size === 0) {
        return res.json({ ok: true, sent: 0, note: "no_profiles_opted_in" });
      }

      // Group the user's ad/store accounts by business profile (opted-in only).
      const byProfile = new Map();
      for (const [, rawStored] of await tokenStore.entries()) {
        const stored = rawStored || {};
        const platform = String(stored.platform || "");
        if (platform !== "meta_business" && platform !== "google_ads" && platform !== "shopify") continue;
        const pid = String(stored.profileId || "").trim();
        if (!pid || !optedInEmails.has(pid)) continue;
        if (!byProfile.has(pid)) byProfile.set(pid, { meta: [], google: [], shopify: null });
        const bucket = byProfile.get(pid);
        if (platform === "meta_business") bucket.meta.push(stored);
        else if (platform === "google_ads") bucket.google.push(stored);
        else if (platform === "shopify" && !bucket.shopify) bucket.shopify = stored;
      }

      const graphVersion = readMetaGraphVersion();
      const googleAdsConfig = readGoogleAdsConfig();
      let sent = 0;
      let noAlert = 0;
      let skippedNoRecipient = 0;
      let failed = 0;
      let deferred = 0;

      for (const [profileId, accounts] of byProfile) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        // Need at least one ad platform for a campaign/ROAS signal.
        if (accounts.meta.length === 0 && accounts.google.length === 0) {
          noAlert += 1;
          continue;
        }

        try {
          const data = await gatherMarketingData(accounts, { graphVersion, googleAdsConfig });
          const alert = buildMarketingAlert({
            businessName: "Your business",
            appUrl: appUrl || undefined,
            currency: data.performance.adSpendCurrency || data.performance.revenueCurrency,
            roas: data.performance.roas,
            adSpend: data.performance.adSpend,
            revenue: data.performance.revenue,
            inventory: data.inventoryAlert,
          });
          if (!alert.hasAlert) {
            noAlert += 1;
            continue;
          }

          const { data: profile } = await supabaseAdmin
            .from("business_profiles")
            .select("id,name,email,owner_user_id")
            .eq("id", profileId)
            .maybeSingle();
          if (!profile) {
            skippedNoRecipient += 1;
            continue;
          }
          const recipient = await resolveRecipientEmail(supabaseAdmin, profile, optedInEmails.get(profileId));
          if (!recipient) {
            skippedNoRecipient += 1;
            continue;
          }

          // Re-render with the real business name now that we have it.
          const named = buildMarketingAlert({
            businessName: String(profile.name || "Your business"),
            appUrl: appUrl || undefined,
            currency: data.performance.adSpendCurrency || data.performance.revenueCurrency,
            roas: data.performance.roas,
            adSpend: data.performance.adSpend,
            revenue: data.performance.revenue,
            inventory: data.inventoryAlert,
          });
          const result = await sendEmail({
            to: recipient,
            subject: named.subject,
            html: named.html,
            text: named.text,
          });
          if (result.ok) {
            sent += 1;
            // Record it so the alert also shows in the notifications bell / Activity.
            void logActivity(supabaseAdmin, {
              businessProfileId: profileId,
              module: "marketing",
              eventType: "marketing.alert",
              severity: "warning",
              summary: named.reasons[0] || "Marketing needs attention",
              payload: { reasons: named.reasons },
            });
          } else {
            failed += 1;
          }
        } catch (err) {
          failed += 1;
          console.warn(
            `[cron] marketing-alerts profile=${profileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(
        `[cron] marketing-alerts: profiles=${byProfile.size} sent=${sent} noAlert=${noAlert} noRecipient=${skippedNoRecipient} failed=${failed} deferred=${deferred}`,
      );
      return res.json({ ok: true, sent, noAlert, skippedNoRecipient, failed, deferred });
    } catch (e) {
      console.error("[cron] marketing-alerts unexpected:", e?.message || e);
      return res.status(500).json({ error: "marketing_alerts_failed" });
    }
  });

  /**
   * Daily marketing snapshot: for every business profile with ad/store accounts,
   * recompute today's blended KPIs and upsert one row into marketing_snapshots.
   * This is what powers the week-over-week trend on the Marketing page. Runs for
   * all such profiles (not just alert opt-ins) so the history is continuous.
   */
  app.get("/api/cron/marketing-snapshot", async (req, res) => {
    if (!isAuthorisedCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!supabaseAdmin || !tokenStore) {
      return res.status(503).json({ error: "dependencies_not_configured" });
    }

    const startedAt = Date.now();
    const timeBudgetMs = 50_000;
    const today = new Date().toISOString().slice(0, 10);

    try {
      const byProfile = new Map();
      for (const [, rawStored] of await tokenStore.entries()) {
        const stored = rawStored || {};
        const platform = String(stored.platform || "");
        if (platform !== "meta_business" && platform !== "google_ads" && platform !== "shopify") continue;
        const pid = String(stored.profileId || "").trim();
        if (!pid) continue;
        if (!byProfile.has(pid)) byProfile.set(pid, { meta: [], google: [], shopify: null });
        const bucket = byProfile.get(pid);
        if (platform === "meta_business") bucket.meta.push(stored);
        else if (platform === "google_ads") bucket.google.push(stored);
        else if (platform === "shopify" && !bucket.shopify) bucket.shopify = stored;
      }

      const graphVersion = readMetaGraphVersion();
      const googleAdsConfig = readGoogleAdsConfig();
      let written = 0;
      let skipped = 0;
      let deferred = 0;

      for (const [profileId, accounts] of byProfile) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        // Need an ad platform or a store to have anything to snapshot.
        if (accounts.meta.length === 0 && accounts.google.length === 0 && !accounts.shopify) {
          skipped += 1;
          continue;
        }
        try {
          const data = await gatherMarketingData(accounts, { graphVersion, googleAdsConfig });
          const p = data.performance;
          if (p.adSpend == null && p.revenue == null) {
            skipped += 1;
            continue;
          }
          const { error } = await supabaseAdmin.from("marketing_snapshots").upsert(
            {
              business_profile_id: profileId,
              snapshot_date: today,
              ad_spend: p.adSpend,
              revenue: p.revenue,
              orders: p.orders,
              roas: p.roas,
              currency: p.adSpendCurrency || p.revenueCurrency,
            },
            { onConflict: "business_profile_id,snapshot_date" },
          );
          if (error) {
            skipped += 1;
            console.warn(`[cron] marketing-snapshot upsert failed profile=${profileId}:`, error.message);
          } else {
            written += 1;
          }
        } catch (err) {
          skipped += 1;
          console.warn(
            `[cron] marketing-snapshot profile=${profileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(`[cron] marketing-snapshot: profiles=${byProfile.size} written=${written} skipped=${skipped} deferred=${deferred}`);
      return res.json({ ok: true, written, skipped, deferred });
    } catch (e) {
      console.error("[cron] marketing-snapshot unexpected:", e?.message || e);
      return res.status(500).json({ error: "marketing_snapshot_failed" });
    }
  });

  /**
   * Weekly performance report: a Monday recap (marketing trend, leads won/new,
   * follow-ups due, tasks completed) emailed to profiles opted into the daily
   * digest. No-ops without email config / opted-in profiles.
   */
  app.get("/api/cron/weekly-report", async (req, res) => {
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
      const { data: optedIn, error: settingsError } = await supabaseAdmin
        .from("automation_settings")
        .select("business_profile_id,notification_email")
        .eq("daily_digest_enabled", true);
      if (settingsError) {
        console.error("[cron] weekly-report settings select failed:", settingsError.message);
        return res.status(500).json({ error: "settings_load_failed" });
      }
      const optedInEmails = new Map(
        (Array.isArray(optedIn) ? optedIn : []).map((r) => [String(r.business_profile_id), String(r.notification_email || "")]),
      );
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
      let failed = 0;
      let deferred = 0;

      for (const profile of Array.isArray(profiles) ? profiles : []) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const bpId = String(profile?.id || "");
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
          const recipient = await resolveRecipientEmail(supabaseAdmin, profile, optedInEmails.get(bpId));
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

      console.log(`[cron] weekly-report: sent=${sent} emptyQuiet=${skippedEmpty} noRecipient=${skippedNoRecipient} failed=${failed} deferred=${deferred}`);
      return res.json({ ok: true, sent, skippedEmpty, skippedNoRecipient, failed, deferred });
    } catch (e) {
      console.error("[cron] weekly-report unexpected:", e?.message || e);
      return res.status(500).json({ error: "weekly_report_failed" });
    }
  });
}
