/**
 * Cron job: emails each active business profile its morning brief
 * (connection issues, overdue/due-today tasks, fresh recommendations).
 */

import { buildDigest } from "../../lib/digest.ts";
import { sendEmail, isEmailConfigured } from "../../lib/email.ts";
import { countPendingOutreachDrafts } from "../../lib/flowAutomationJobs.ts";
import { portfolioScoreDeltaFromSnapshots } from "../../lib/marketingSnapshotTrend.ts";
import { loadProfileDocument } from "../../lib/profileDocumentStore.ts";
import { fetchShopifyLowStock } from "../../providers/shopify.ts";
import {
  parseFortnoxInvoiceQueue,
  parseFortnoxCreditQueue,
  FORTNOX_INVOICE_QUEUE_DOC_KEY,
  FORTNOX_CREDIT_QUEUE_DOC_KEY,
} from "../../lib/fortnoxInvoiceJobs.ts";

export function registerDailyDigestCron(
  app,
  {
    withRunRecording,
    baseUrl,
    isAuthorisedCron,
    supabaseAdmin,
    tokenStore,
    resolveRecipientEmail,
    isProfileJobDueNow,
    loadFailedAutomationTitles,
    platformLabel,
  }
) {
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

    const appUrl = baseUrl;
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
          const now = new Date();
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date(now);
          endOfToday.setHours(23, 59, 59, 999);

          // These reads are independent of each other, so they run concurrently:
          // sequentially they were ~10 round trips per profile against a 50s
          // budget, which silently deferred later profiles out of their digest.
          // Each signal still owns its own error handling, so one failing source
          // degrades to a neutral value instead of taking the others with it.
          const [
            accounts,
            taskRows,
            recRows,
            leadsToFollowUp,
            outreachQueuePending,
            reviewsNeedingReply,
            marketing,
            unbilledOrdersCount,
            pendingCreditInvoicesCount,
          ] = await Promise.all([
            // Also carries `id`/`platform` so the Shopify lookup below needs no
            // second query against the same table.
            (async () => {
              const { data } = await supabaseAdmin
                .from("connected_accounts")
                .select("id,platform,health,disconnected_at")
                .eq("business_profile_id", businessProfileId);
              return Array.isArray(data) ? data : [];
            })().catch(() => []),

            (async () => {
              const { data } = await supabaseAdmin
                .from("tasks")
                .select("title,status,due_at")
                .eq("business_profile_id", businessProfileId)
                .in("status", ["open", "in_progress", "blocked"]);
              return Array.isArray(data) ? data : [];
            })().catch(() => []),

            (async () => {
              const { data } = await supabaseAdmin
                .from("ai_recommendations")
                .select("title,status")
                .eq("business_profile_id", businessProfileId)
                .in("status", ["new", "seen"]);
              return Array.isArray(data) ? data : [];
            })().catch(() => []),

            // Open leads whose follow-up is overdue or due today (best-effort —
            // the table may not exist before its migration is applied).
            (async () => {
              const { data } = await supabaseAdmin
                .from("leads")
                .select("status,next_follow_up_at")
                .eq("business_profile_id", businessProfileId)
                .in("status", ["new", "contacted", "qualified"])
                .not("next_follow_up_at", "is", null)
                .lte("next_follow_up_at", endOfToday.toISOString());
              return Array.isArray(data) ? data.length : 0;
            })().catch(() => 0),

            (async () => {
              const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, "outreach-queue");
              return countPendingOutreachDrafts(doc?.data);
            })().catch(() => 0),

            (async () => {
              const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, "review-replies");
              const raw = doc?.data;
              if (!raw || typeof raw !== "object") return 0;
              const pending = Number(raw.pendingCount ?? 0);
              const updatedAt = String(raw.updatedAt || "");
              const age = updatedAt ? Date.now() - Date.parse(updatedAt) : Number.POSITIVE_INFINITY;
              const isFresh = Number.isFinite(age) && age < 48 * 60 * 60 * 1000;
              return Number.isFinite(pending) && pending > 0 && isFresh ? Math.trunc(pending) : 0;
            })().catch(() => 0),

            (async () => {
              const { data } = await supabaseAdmin
                .from("marketing_snapshots")
                .select("snapshot_date,roas,portfolio_score")
                .eq("business_profile_id", businessProfileId)
                .order("snapshot_date", { ascending: false })
                .limit(14);
              const rows = Array.isArray(data) ? data : [];
              const latestRoas = rows[0]?.roas == null ? null : Number(rows[0].roas);
              if (latestRoas != null && Number.isFinite(latestRoas) && latestRoas < 1) {
                return { underwaterRoas: latestRoas, marketingTrendDown: false };
              }
              const delta = portfolioScoreDeltaFromSnapshots(
                rows.map((r) => ({
                  snapshotDate: String(r.snapshot_date || ""),
                  portfolioScore: r.portfolio_score == null ? null : Number(r.portfolio_score),
                })),
              );
              return { underwaterRoas: null, marketingTrendDown: delta != null && delta <= -10 };
            })().catch(() => ({ underwaterRoas: null, marketingTrendDown: false })),

            (async () => {
              const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_INVOICE_QUEUE_DOC_KEY);
              return parseFortnoxInvoiceQueue(doc?.data).filter(
                (q) => q.status === "suggested" || q.status === "failed"
              ).length;
            })().catch(() => 0),

            (async () => {
              const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, FORTNOX_CREDIT_QUEUE_DOC_KEY);
              return parseFortnoxCreditQueue(doc?.data).filter(
                (q) => q.status === "suggested" || q.status === "failed"
              ).length;
            })().catch(() => 0),
          ]);

          // Connection issues (anything not healthy/pending and still active).
          const connectionIssues = accounts
            .filter((a) => !a?.disconnected_at)
            .filter((a) => a?.health && a.health !== "healthy" && a.health !== "pending" && a.health !== "disconnected")
            .map((a) => ({ label: platformLabel(a.platform), health: String(a.health) }));

          // Open tasks with due dates → overdue vs due-today.
          const overdueTasks = [];
          const dueTodayTasks = [];
          for (const t of taskRows) {
            if (!t?.due_at) continue;
            const due = new Date(t.due_at);
            if (Number.isNaN(due.getTime())) continue;
            if (due < startOfToday) overdueTasks.push({ title: String(t.title || "Task") });
            else if (due <= endOfToday) dueTodayTasks.push({ title: String(t.title || "Task") });
          }

          const newRecommendations = recRows.map((r) => ({
            title: String(r?.title || "Recommendation"),
          }));

          const { underwaterRoas, marketingTrendDown } = marketing;

          // Live Shopify stock lookup — depends on the accounts read above, so
          // it cannot join the parallel batch.
          let lowStockCount = 0;
          try {
            const shopifyAccount = accounts.find(
              (a) => a?.platform === "shopify" && !a?.disconnected_at && a?.id
            );
            if (shopifyAccount?.id && tokenStore) {
              const stored = await tokenStore.get(String(shopifyAccount.id));
              const accessToken = String(stored?.accessToken || "").trim();
              const shop = String(stored?.shop || "").trim();
              if (accessToken && shop) {
                const stock = await fetchShopifyLowStock(accessToken, shop);
                lowStockCount = (stock?.outOfStock ?? 0) + (stock?.lowStock ?? 0);
              }
            }
          } catch {
            /* Shopify stock signal optional */
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
            lowStockCount,
            unbilledOrdersCount,
            pendingCreditInvoicesCount,
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
}
