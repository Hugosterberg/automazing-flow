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
  const { oauthPendingStore, supabaseAdmin, zernio, secretResolver } = deps;

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
      const { data: profiles, error } = await supabaseAdmin
        .from("business_profiles")
        .select("id,name,email,owner_user_id")
        .eq("status", "active");
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

          const digest = buildDigest({
            businessName: String(profile.name || "Your business"),
            appUrl: appUrl || undefined,
            connectionIssues,
            overdueTasks,
            dueTodayTasks,
            newRecommendations,
          });

          if (!digest.hasContent) {
            skippedEmpty += 1;
            continue;
          }

          // Recipient: the profile's contact email, else the owner's login email.
          let recipient = String(profile.email || "").trim();
          if (!recipient && profile.owner_user_id) {
            try {
              const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
                String(profile.owner_user_id),
              );
              recipient = String(userData?.user?.email || "").trim();
            } catch {
              // owner lookup is best-effort
            }
          }
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
}
