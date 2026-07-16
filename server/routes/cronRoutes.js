/**
 * Scheduled / on-demand maintenance (Vercel Cron, manual curl, etc.).
 *
 * Every endpoint requires `Authorization: Bearer <CRON_SECRET>` — the same
 * header Vercel Cron sends automatically when `CRON_SECRET` is configured
 * on the project. When the secret is unset the endpoints fail closed (401)
 * so a half-deployed environment can't silently run housekeeping jobs.
 */

import crypto from "crypto";
import { automationSettingsRowToDomain } from "../automation/autoReply.ts";
import { buildDigest } from "../lib/digest.ts";
import { sendEmail, isEmailConfigured } from "../lib/email.ts";
import {
  countPendingOutreachDrafts,
  runCartRecovery,
  runSalesOutreachAuto,
  runStaleLeadOutreach,
} from "../lib/flowAutomationJobs.ts";
import { buildMarketingAlert, extractPoorCampaignsForAlert } from "../lib/marketingAlert.ts";
import { buildCampaignSnapshotRows } from "../lib/marketingCampaignSnapshots.ts";
import { buildSocialStatsSnapshotRow } from "../lib/socialStatsSnapshots.ts";
import { gatherMarketingData, readGoogleAdsConfig, readMetaGraphVersion } from "../lib/marketingData.ts";
import { portfolioScoreDeltaFromSnapshots } from "../lib/marketingSnapshotTrend.ts";
import { runMarketingActions } from "../lib/marketingCampaignActions.ts";
import { loadProfileDocument } from "../lib/profileDocumentStore.ts";
import { logActivity } from "../lib/activityLog.ts";
import { recordAutomationRun } from "../lib/automationRunLog.ts";
import { buildWeeklyReport } from "../lib/weeklyReport.ts";
import { fetchMarketPulseForCron, DEFAULT_MARKET_PULSE_TOPIC } from "../lib/marketPulseFetch.ts";
import { shouldRunProfileJob } from "../lib/profileJobSchedule.ts";
import { buildLeadReminder, buildTaskReminder } from "../lib/reminderEmails.ts";
import { registerCleanupOauthPendingCron } from "./cron/cleanupOauthPending.js";
import { registerRefreshAiRecommendationsCron } from "./cron/refreshAiRecommendations.js";
import { registerAutoReplyCron } from "./cron/autoReply.js";
import { registerPublishScheduledPostsCron } from "./cron/publishScheduledPosts.js";
import { registerContentPipelineCron } from "./cron/contentPipeline.js";
import { registerMailReplyAutoCron } from "./cron/mailReplyAuto.js";
import { registerReviewReplyAutoCron } from "./cron/reviewReplyAuto.js";
import { registerWeeklyInsightDigestCron } from "./cron/weeklyInsightDigest.js";
import { registerEngagementFollowupCron } from "./cron/engagementFollowup.js";
import { registerLeadReminderCron } from "./cron/leadReminder.js";
import { registerTaskReminderCron } from "./cron/taskReminder.js";
import { registerSalesOutreachAutoCron } from "./cron/salesOutreachAuto.js";
import { registerCartRecoveryCron } from "./cron/cartRecovery.js";
import { registerMarketingActionsCron } from "./cron/marketingActions.js";

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

/** Human-readable automation title for digest copy (mirrors automationCatalog). */
function automationTitleForKey(key) {
  const map = {
    "auto-reply": "Auto-svar på DM:s",
    "publish-scheduled-posts": "Publicera schemalagda inlägg",
    "daily-digest": "Daglig översikt",
    "weekly-report": "Veckorapport",
    "lead-reminder": "Lead-påminnelse",
    "task-reminder": "Uppgiftspåminnelse",
    "marketing-alerts": "Marknadsförings-larm",
    "refresh-ai-recommendations": "AI-rekommendationer",
    "marketing-snapshot": "Marknadsförings-snapshot",
    "market-pulse-snapshot": "Market pulse-snapshot",
    "social-stats-snapshot": "Social statistik-snapshot",
    "sales-outreach-auto": "Automatisk outreach",
    "content-pipeline": "Innehållspipeline",
    "cart-recovery": "Kundvagnsåtervinning",
    "review-reply-auto": "Automatiska review-svar",
    "mail-reply-auto": "Automatiska mail-utkast",
    "marketing-actions": "Marknadsförings-åtgärder",
    "weekly-insight-digest": "Veckovis insiktsrapport",
    "engagement-followup": "Engagement-följdflöde",
  };
  return map[key] || key;
}

/** Latest failed global cron runs for the daily brief. */
async function loadFailedAutomationTitles(supabaseAdmin) {
  const { data } = await supabaseAdmin
    .from("automation_runs")
    .select("automation_key,status,finished_at")
    .is("business_profile_id", null)
    .eq("status", "failed")
    .order("finished_at", { ascending: false })
    .limit(30);
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(data) ? data : []) {
    const key = String(row?.automation_key || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title: automationTitleForKey(key) });
    if (out.length >= 5) break;
  }
  return out;
}

/** True when a social automation workflow toggle is on in profile_documents. */
async function isSocialWorkflowEnabled(supabaseAdmin, businessProfileId, workflowId) {
  try {
    const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, "social-workflows");
    const raw = doc?.data;
    if (!raw || typeof raw !== "object") return false;
    const enabled = raw.enabled;
    return Boolean(enabled && typeof enabled === "object" && enabled[workflowId]);
  } catch {
    return false;
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

/** True when this profile's stored schedule says the job should run now. */
function isProfileJobDueNow(settingsRow, cronKey, now = new Date()) {
  const settings = automationSettingsRowToDomain(settingsRow);
  return shouldRunProfileJob(cronKey, settings.jobSchedules, undefined, now);
}

/** Load all automation_settings rows keyed by business_profile_id. */
async function loadAllAutomationSettings(supabaseAdmin) {
  const { data, error } = await supabaseAdmin.from("automation_settings").select("*");
  if (error) {
    console.warn("[cron] automation_settings load failed:", error.message);
    return new Map();
  }
  const map = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const id = String(row?.business_profile_id || "").trim();
    if (id) map.set(id, row);
  }
  return map;
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
 * Distil a handler's JSON envelope into a compact, machine-readable result
 * summary for `automation_runs.result`: keep the scalar count fields each job
 * already reports (sent / skipped / failed / written / …) and drop the large
 * per-tenant arrays (`summary`, `summaries`) plus the `ok`/`error` envelope.
 */
function summariseCronResult(body) {
  if (!body || typeof body !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "ok" || key === "error") continue;
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Wrap a cron handler so every real execution appends one `automation_runs`
 * row (fire-and-forget). We intercept the handler's own `res.json` envelope so
 * the large handlers below stay untouched and we record exactly the summary
 * each one already returns.
 *
 * Not recorded: rejected calls that never did work — a failed auth guard (401)
 * or an unconfigured-dependency no-op (503). Everything that actually executed
 * (200 success, or a 5xx failure mid-run) is recorded globally, because each
 * Vercel cron is a single sweep across every tenant.
 */
function withRunRecording(automationKey, supabaseAdmin, handler) {
  return async (req, res) => {
    const startedAt = new Date().toISOString();
    const sendJson = res.json.bind(res);
    let recorded = false;
    res.json = (body) => {
      if (!recorded) {
        recorded = true;
        const httpStatus = Number(res.statusCode) || 200;
        if (httpStatus !== 401 && httpStatus !== 503) {
          const ok = httpStatus < 400 && !(body && body.error);
          void recordAutomationRun(supabaseAdmin, {
            automationKey,
            businessProfileId: null,
            status: ok ? "ok" : "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
            result: summariseCronResult(body),
            errorMessage: ok
              ? null
              : String((body && body.error) || "").slice(0, 300) || null,
          });
        }
      }
      return sendJson(body);
    };
    return handler(req, res);
  };
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

  registerCleanupOauthPendingCron(app, {
    oauthPendingStore,
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
  });

  registerRefreshAiRecommendationsCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  });

  registerAutoReplyCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    secretResolver,
  });

  registerPublishScheduledPostsCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    tokenStore,
    loadAllAutomationSettings,
  });

  /**
   * Daily digest: emails each active business profile its morning brief
   * (connection issues, overdue/due-today tasks, fresh recommendations) so the
   * "check everything" task is automated. No-ops cleanly when email isn't
   * configured (RESEND_API_KEY). All-clear profiles are skipped — we only mail
   * when there's something to act on, so the inbox stays signal.
   */
  app.get("/api/cron/daily-digest", withRunRecording("daily-digest", supabaseAdmin, async (req, res) => {
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
        .select("business_profile_id,notification_email,job_schedules,daily_digest_enabled")
        .eq("daily_digest_enabled", true);
      if (settingsError) {
        console.error("[cron] daily-digest settings select failed:", settingsError.message);
        return res.status(500).json({ error: "settings_load_failed" });
      }
      const optedInEmails = new Map(
        (Array.isArray(optedIn) ? optedIn : []).map((r) => [
          String(r.business_profile_id),
          { email: String(r.notification_email || ""), row: r },
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
      let skippedForSchedule = 0;
      let failed = 0;
      let deferred = 0;
      const cronNow = new Date();
      const failedAutomations = await loadFailedAutomationTitles(supabaseAdmin);

      for (const profile of Array.isArray(profiles) ? profiles : []) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const businessProfileId = String(profile?.id || "").trim();
        if (!businessProfileId) continue;
        const settingsEntry = optedInEmails.get(businessProfileId);
        if (!settingsEntry || !isProfileJobDueNow(settingsEntry.row, "daily-digest", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
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

          let outreachQueuePending = 0;
          try {
            const outreachDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, "outreach-queue");
            outreachQueuePending = countPendingOutreachDrafts(outreachDoc?.data);
          } catch {
            /* profile_documents not available yet */
          }

          let reviewsNeedingReply = 0;
          try {
            const reviewDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, "review-replies");
            const raw = reviewDoc?.data;
            if (raw && typeof raw === "object") {
              const pending = Number((raw).pendingCount ?? 0);
              const updatedAt = String((raw).updatedAt || "");
              const age = updatedAt ? Date.now() - Date.parse(updatedAt) : Number.POSITIVE_INFINITY;
              if (Number.isFinite(pending) && pending > 0 && Number.isFinite(age) && age < 48 * 60 * 60 * 1000) {
                reviewsNeedingReply = Math.trunc(pending);
              }
            }
          } catch {
            /* review state optional */
          }

          let underwaterRoas = null;
          let marketingTrendDown = false;
          try {
            const { data: snaps } = await supabaseAdmin
              .from("marketing_snapshots")
              .select("snapshot_date,roas,portfolio_score")
              .eq("business_profile_id", businessProfileId)
              .order("snapshot_date", { ascending: false })
              .limit(14);
            const rows = Array.isArray(snaps) ? snaps : [];
            const latestRoas = rows[0]?.roas == null ? null : Number(rows[0].roas);
            if (latestRoas != null && Number.isFinite(latestRoas) && latestRoas < 1) {
              underwaterRoas = latestRoas;
            } else {
              const delta = portfolioScoreDeltaFromSnapshots(
                rows.map((r) => ({
                  snapshotDate: String(r.snapshot_date || ""),
                  portfolioScore: r.portfolio_score == null ? null : Number(r.portfolio_score),
                })),
              );
              marketingTrendDown = delta != null && delta <= -10;
            }
          } catch {
            /* marketing snapshots optional */
          }

          const digest = buildDigest({
            businessName: String(profile.name || "Your business"),
            appUrl: appUrl || undefined,
            connectionIssues,
            leadsToFollowUp,
            outreachQueuePending,
            underwaterRoas,
            marketingTrendDown,
            reviewsNeedingReply,
            failedAutomations,
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
            settingsEntry.email,
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
        `[cron] daily-digest: profiles=${(profiles || []).length} sent=${sent} emptyAllClear=${skippedEmpty} noRecipient=${skippedNoRecipient} skippedForSchedule=${skippedForSchedule} failed=${failed} deferred=${deferred}`,
      );
      return res.json({ ok: true, sent, skippedEmpty, skippedNoRecipient, skippedForSchedule, failed, deferred });
    } catch (e) {
      console.error("[cron] daily-digest unexpected:", e?.message || e);
      return res.status(500).json({ error: "daily_digest_failed" });
    }
  }));

  /**
   * Marketing watchdog: per business profile, recomputes blended marketing
   * performance from its connected ad/store accounts and emails an alert when
   * ad spend is running underwater (ROAS < 1×) or campaigns run while the store
   * is out of stock. Reuses the exact same gathering as the Marketing page, so
   * the alert and the dashboard never disagree. No-ops without email config.
   */
  app.get("/api/cron/marketing-alerts", withRunRecording("marketing-alerts", supabaseAdmin, async (req, res) => {
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
        .select("business_profile_id,notification_email,job_schedules,marketing_alerts_enabled")
        .eq("marketing_alerts_enabled", true);
      if (settingsError) {
        console.error("[cron] marketing-alerts settings select failed:", settingsError.message);
        return res.status(500).json({ error: "settings_load_failed" });
      }
      const optedInEmails = new Map(
        (Array.isArray(optedIn) ? optedIn : []).map((r) => [
          String(r.business_profile_id),
          { email: String(r.notification_email || ""), row: r },
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
      let skippedForSchedule = 0;
      let failed = 0;
      let deferred = 0;
      const cronNow = new Date();

      for (const [profileId, accounts] of byProfile) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const settingsEntry = optedInEmails.get(profileId);
        if (!settingsEntry || !isProfileJobDueNow(settingsEntry.row, "marketing-alerts", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
        // Need at least one ad platform for a campaign/ROAS signal.
        if (accounts.meta.length === 0 && accounts.google.length === 0) {
          noAlert += 1;
          continue;
        }

        try {
          const data = await gatherMarketingData(accounts, { graphVersion, googleAdsConfig });

          const { data: priorSnaps } = await supabaseAdmin
            .from("marketing_snapshots")
            .select("snapshot_date, portfolio_score")
            .eq("business_profile_id", profileId)
            .order("snapshot_date", { ascending: false })
            .limit(14);
          const portfolioScoreDelta = portfolioScoreDeltaFromSnapshots(
            (Array.isArray(priorSnaps) ? priorSnaps : []).map((r) => ({
              snapshotDate: String(r.snapshot_date || ""),
              portfolioScore: r.portfolio_score == null ? null : Number(r.portfolio_score),
            })),
          );

          const poorCampaigns = extractPoorCampaignsForAlert(data.platforms);
          const alert = buildMarketingAlert({
            businessName: "Your business",
            appUrl: appUrl || undefined,
            currency: data.performance.adSpendCurrency || data.performance.revenueCurrency,
            roas: data.performance.roas,
            adSpend: data.performance.adSpend,
            revenue: data.performance.revenue,
            portfolioGrade: data.analytics?.portfolioGrade ?? null,
            portfolioScore: data.analytics?.portfolioScore ?? null,
            portfolioScoreDelta,
            campaignsPoor: data.analytics?.campaignsPoor ?? 0,
            poorCampaigns,
            recommendations: data.analytics?.recommendations ?? [],
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
          const recipient = await resolveRecipientEmail(supabaseAdmin, profile, settingsEntry.email);
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
            portfolioGrade: data.analytics?.portfolioGrade ?? null,
            portfolioScore: data.analytics?.portfolioScore ?? null,
            portfolioScoreDelta,
            campaignsPoor: data.analytics?.campaignsPoor ?? 0,
            poorCampaigns,
            recommendations: data.analytics?.recommendations ?? [],
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
        `[cron] marketing-alerts: profiles=${byProfile.size} sent=${sent} noAlert=${noAlert} noRecipient=${skippedNoRecipient} skippedForSchedule=${skippedForSchedule} failed=${failed} deferred=${deferred}`,
      );
      return res.json({ ok: true, sent, noAlert, skippedNoRecipient, skippedForSchedule, failed, deferred });
    } catch (e) {
      console.error("[cron] marketing-alerts unexpected:", e?.message || e);
      return res.status(500).json({ error: "marketing_alerts_failed" });
    }
  }));

  /**
   * Daily marketing snapshot: for every business profile with ad/store accounts,
   * recompute today's blended KPIs and upsert one row into marketing_snapshots.
   * This is what powers the week-over-week trend on the Marketing page. Runs for
   * all such profiles (not just alert opt-ins) so the history is continuous.
   */
  app.get("/api/cron/marketing-snapshot", withRunRecording("marketing-snapshot", supabaseAdmin, async (req, res) => {
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
      const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
      const cronNow = new Date();
      let written = 0;
      let skipped = 0;
      let skippedForSchedule = 0;
      let deferred = 0;

      for (const [profileId, accounts] of byProfile) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        if (!isProfileJobDueNow(settingsByProfile.get(profileId), "marketing-snapshot", cronNow)) {
          skippedForSchedule += 1;
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
              portfolio_score: data.analytics?.portfolioScore ?? null,
              portfolio_grade: data.analytics?.portfolioGrade ?? null,
              campaigns_poor: data.analytics?.campaignsPoor ?? null,
            },
            { onConflict: "business_profile_id,snapshot_date" },
          );
          if (error) {
            skipped += 1;
            console.warn(`[cron] marketing-snapshot upsert failed profile=${profileId}:`, error.message);
          } else {
            written += 1;
          }

          const campaignRows = buildCampaignSnapshotRows(profileId, today, data.platforms);
          if (campaignRows.length > 0) {
            const { error: campErr } = await supabaseAdmin.from("marketing_campaign_snapshots").upsert(
              campaignRows,
              { onConflict: "business_profile_id,snapshot_date,platform,campaign_id" },
            );
            if (campErr) {
              console.warn(
                `[cron] marketing-snapshot campaign rows failed profile=${profileId}:`,
                campErr.message,
              );
            }
          }
        } catch (err) {
          skipped += 1;
          console.warn(
            `[cron] marketing-snapshot profile=${profileId} failed:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      console.log(`[cron] marketing-snapshot: profiles=${byProfile.size} written=${written} skipped=${skipped} skippedForSchedule=${skippedForSchedule} deferred=${deferred}`);
      return res.json({ ok: true, written, skipped, skippedForSchedule, deferred });
    } catch (e) {
      console.error("[cron] marketing-snapshot unexpected:", e?.message || e);
      return res.status(500).json({ error: "marketing_snapshot_failed" });
    }
  }));

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

  /**
   * Weekly performance report: a Monday recap (marketing trend, leads won/new,
   * follow-ups due, tasks completed) emailed to profiles opted into the daily
   * digest. No-ops without email config / opted-in profiles.
   */
  app.get("/api/cron/weekly-report", withRunRecording("weekly-report", supabaseAdmin, async (req, res) => {
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
      const settingsByProfile = await loadAllAutomationSettings(supabaseAdmin);
      const optedInEmails = new Map();
      for (const [bpId, row] of settingsByProfile) {
        const settings = automationSettingsRowToDomain(row);
        if (!settings.jobSchedules["weekly-report"]?.enabled) continue;
        optedInEmails.set(bpId, {
          email: settings.notificationEmail,
          row,
        });
      }
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
      let skippedForSchedule = 0;
      let failed = 0;
      let deferred = 0;
      const cronNow = new Date();

      for (const profile of Array.isArray(profiles) ? profiles : []) {
        if (Date.now() - startedAt > timeBudgetMs) {
          deferred += 1;
          continue;
        }
        const bpId = String(profile?.id || "");
        const settingsEntry = optedInEmails.get(bpId);
        if (!settingsEntry || !isProfileJobDueNow(settingsEntry.row, "weekly-report", cronNow)) {
          skippedForSchedule += 1;
          continue;
        }
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
          const recipient = await resolveRecipientEmail(supabaseAdmin, profile, settingsEntry.email);
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

      console.log(`[cron] weekly-report: sent=${sent} emptyQuiet=${skippedEmpty} noRecipient=${skippedNoRecipient} skippedForSchedule=${skippedForSchedule} failed=${failed} deferred=${deferred}`);
      return res.json({ ok: true, sent, skippedEmpty, skippedNoRecipient, skippedForSchedule, failed, deferred });
    } catch (e) {
      console.error("[cron] weekly-report unexpected:", e?.message || e);
      return res.status(500).json({ error: "weekly_report_failed" });
    }
  }));

  registerLeadReminderCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

  registerTaskReminderCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

  registerSalesOutreachAutoCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

  registerContentPipelineCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  });

  registerCartRecoveryCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  });

  registerMailReplyAutoCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    secretResolver,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

  registerReviewReplyAutoCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    tokenStore,
    secretResolver,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

  registerMarketingActionsCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

  registerWeeklyInsightDigestCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    isSocialWorkflowEnabled,
    resolveRecipientEmail,
  });

  registerEngagementFollowupCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    zernio,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    isSocialWorkflowEnabled,
    resolveRecipientEmail,
  });
}
