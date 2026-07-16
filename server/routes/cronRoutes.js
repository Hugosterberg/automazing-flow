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
import { loadProfileDocument } from "../lib/profileDocumentStore.ts";
import { recordAutomationRun } from "../lib/automationRunLog.ts";
import { shouldRunProfileJob } from "../lib/profileJobSchedule.ts";
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
import { registerDailyDigestCron } from "./cron/dailyDigest.js";
import { registerMarketingAlertsCron } from "./cron/marketingAlerts.js";
import { registerMarketingSnapshotCron } from "./cron/marketingSnapshot.js";
import { registerSocialStatsSnapshotCron } from "./cron/socialStatsSnapshot.js";
import { registerMarketPulseSnapshotCron } from "./cron/marketPulseSnapshot.js";
import { registerWeeklyReportCron } from "./cron/weeklyReport.js";

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

  registerDailyDigestCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    resolveRecipientEmail,
    isProfileJobDueNow,
    loadFailedAutomationTitles,
    platformLabel,
  });

  registerMarketingAlertsCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    resolveRecipientEmail,
    isProfileJobDueNow,
  });

  registerMarketingSnapshotCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  });

  registerSocialStatsSnapshotCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  });

  registerMarketPulseSnapshotCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    loadAllAutomationSettings,
    isProfileJobDueNow,
  });

  registerWeeklyReportCron(app, {
    withRunRecording,
    isAuthorisedCron,
    supabaseAdmin,
    loadAllAutomationSettings,
    isProfileJobDueNow,
    resolveRecipientEmail,
  });

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
