/**
 * Auto-reply automation: per-profile settings, audit log, and a manual
 * "run now" trigger for the active business profile.
 *
 * All endpoints are membership-gated (`requireMembership` attaches
 * `req.businessProfileId` + `req.membershipRole`). Writes and manual runs are
 * blocked for viewers. The scheduled entrypoint lives in cronRoutes
 * (`GET /api/cron/auto-reply`, CRON_SECRET-protected).
 */

import {
  DEFAULT_AUTOMATION_SETTINGS,
  automationSettingsRowToDomain,
  runAutoReplyForProfile,
} from "../automation/autoReply.ts";
import type { AutoReplyDeps } from "../automation/autoReply.ts";
import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import type { SecretResolver } from "../lib/secretResolver.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder chain is intentionally untyped for brevity
type SupabaseAdminLike = { from: (table: string) => any };

interface AutomationRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: SupabaseAdminLike | null;
  zernio: ZernioModule;
  secretResolver: SecretResolver;
  getSessionUserId: (req: unknown) => string | null;
}

const SETTINGS_COLUMNS =
  "business_profile_id,dm_auto_reply_enabled,dm_auto_reply_mode,tone,language,instructions,daily_digest_enabled,marketing_alerts_enabled,notification_email,updated_at";

function canManageAutomation(role: unknown): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function registerAutomationRoutes(app, deps: AutomationRoutesDeps) {
  const { requireMembership, supabaseAdmin, zernio, secretResolver, getSessionUserId } = deps;

  app.get("/api/automation/settings", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    if (!supabaseAdmin) {
      return res.json({ storeEnabled: false, settings: { ...DEFAULT_AUTOMATION_SETTINGS } });
    }
    try {
      // Select "*" so a not-yet-applied migration (new notification columns)
      // never breaks reads — the domain mapper treats missing columns as off.
      const { data, error } = await supabaseAdmin
        .from("automation_settings")
        .select("*")
        .eq("business_profile_id", businessProfileId)
        .maybeSingle();
      if (error) {
        console.warn("[automation] settings select failed:", error.message);
        return res.status(500).json({ error: "automation_settings_load_failed" });
      }
      return res.json({ storeEnabled: true, settings: automationSettingsRowToDomain(data) });
    } catch (e) {
      console.error("[automation] settings load unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "automation_settings_load_failed" });
    }
  });

  app.put("/api/automation/settings", requireMembership, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "supabase_service_role_not_configured" });
    }
    if (!canManageAutomation(req.membershipRole)) {
      return res.status(403).json({ error: "forbidden_role" });
    }

    const businessProfileId = String(req.businessProfileId || "").trim();
    const body = (req.body ?? {}) as {
      dmAutoReplyEnabled?: boolean;
      dmAutoReplyMode?: string;
      tone?: string;
      language?: string;
      instructions?: string;
      dailyDigestEnabled?: boolean;
      marketingAlertsEnabled?: boolean;
      notificationEmail?: string;
    };

    const mode = body.dmAutoReplyMode === "send" ? "send" : "draft";
    // A notification email is optional; when provided it must look like one.
    const rawEmail = String(body.notificationEmail ?? "").trim().slice(0, 254);
    const notificationEmail = rawEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail) ? rawEmail : "";
    const row = {
      business_profile_id: businessProfileId,
      dm_auto_reply_enabled: Boolean(body.dmAutoReplyEnabled),
      dm_auto_reply_mode: mode,
      tone: String(body.tone ?? DEFAULT_AUTOMATION_SETTINGS.tone).trim() || DEFAULT_AUTOMATION_SETTINGS.tone,
      language:
        String(body.language ?? DEFAULT_AUTOMATION_SETTINGS.language).trim() || DEFAULT_AUTOMATION_SETTINGS.language,
      instructions: String(body.instructions ?? "").slice(0, 2000),
      daily_digest_enabled: Boolean(body.dailyDigestEnabled),
      marketing_alerts_enabled: Boolean(body.marketingAlertsEnabled),
      notification_email: notificationEmail || null,
      updated_by: getSessionUserId(req),
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabaseAdmin
        .from("automation_settings")
        .upsert(row, { onConflict: "business_profile_id" })
        .select(SETTINGS_COLUMNS)
        .single();
      if (error) {
        console.warn("[automation] settings upsert failed:", error.message);
        return res.status(500).json({ error: "automation_settings_save_failed" });
      }
      return res.json({ ok: true, settings: automationSettingsRowToDomain(data) });
    } catch (e) {
      console.error("[automation] settings save unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "automation_settings_save_failed" });
    }
  });

  app.get("/api/automation/log", requireMembership, async (req, res) => {
    if (!supabaseAdmin) {
      return res.json({ entries: [] });
    }
    const businessProfileId = String(req.businessProfileId || "").trim();
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 25));
    try {
      const { data, error } = await supabaseAdmin
        .from("auto_reply_log")
        .select("id,kind,conversation_id,platform,author_name,incoming_text,draft_text,status,error,created_at")
        .eq("business_profile_id", businessProfileId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        console.warn("[automation] log select failed:", error.message);
        return res.status(500).json({ error: "automation_log_load_failed" });
      }
      return res.json({ entries: data || [] });
    } catch (e) {
      console.error("[automation] log load unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "automation_log_load_failed" });
    }
  });

  // Human-in-the-loop send: ship a logged draft (optionally edited) through
  // Zernio and flip its log row to 'sent'. Only 'drafted' DM rows qualify, so
  // a draft can never be sent twice.
  app.post("/api/automation/send-draft", requireMembership, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "supabase_service_role_not_configured" });
    }
    if (!canManageAutomation(req.membershipRole)) {
      return res.status(403).json({ error: "forbidden_role" });
    }

    const businessProfileId = String(req.businessProfileId || "").trim();
    const body = (req.body ?? {}) as { logId?: string; message?: string };
    const logId = String(body.logId || "").trim();
    if (!logId) {
      return res.status(400).json({ error: "logId is required" });
    }

    try {
      const { data: row, error } = await supabaseAdmin
        .from("auto_reply_log")
        .select("id,kind,status,conversation_id,zernio_account_id,draft_text")
        .eq("business_profile_id", businessProfileId)
        .eq("id", logId)
        .maybeSingle();
      if (error || !row) {
        return res.status(404).json({ error: "draft_not_found" });
      }
      if (row.kind !== "dm" || row.status !== "drafted") {
        return res.status(400).json({ error: "draft_not_sendable" });
      }
      const conversationId = String(row.conversation_id || "").trim();
      const zernioAccountId = String(row.zernio_account_id || "").trim();
      const message = String(body.message ?? row.draft_text ?? "").trim();
      if (!conversationId || !zernioAccountId || !message) {
        return res.status(400).json({ error: "draft_missing_send_data" });
      }

      const sendResult = await zernio.sendInboxMessage({
        conversationId,
        accountId: zernioAccountId,
        message,
      });
      if (!sendResult.ok) {
        const failure = describeZernioFailure(sendResult);
        await supabaseAdmin
          .from("auto_reply_log")
          .update({ error: failure.message })
          .eq("id", logId);
        return res
          .status(sendResult.status >= 400 && sendResult.status < 600 ? sendResult.status : 502)
          .json({ error: failure.code, message: failure.message });
      }

      const { error: updateError } = await supabaseAdmin
        .from("auto_reply_log")
        .update({ status: "sent", draft_text: message, error: null })
        .eq("id", logId);
      if (updateError) {
        console.warn("[automation] send-draft log update failed:", updateError.message);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("[automation] send-draft failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "send_draft_failed" });
    }
  });

  // Manual trigger for the active profile — same engine the cron uses, so
  // users can test their settings without waiting for a schedule.
  app.post("/api/automation/run", requireMembership, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "supabase_service_role_not_configured" });
    }
    if (!canManageAutomation(req.membershipRole)) {
      return res.status(403).json({ error: "forbidden_role" });
    }

    const businessProfileId = String(req.businessProfileId || "").trim();
    try {
      const [{ data: profileRow, error: profileError }, { data: settingsRow, error: settingsError }] =
        await Promise.all([
          supabaseAdmin
            .from("business_profiles")
            .select("id,name,zernio_profile_id")
            .eq("id", businessProfileId)
            .maybeSingle(),
          supabaseAdmin
            .from("automation_settings")
            .select(SETTINGS_COLUMNS)
            .eq("business_profile_id", businessProfileId)
            .maybeSingle(),
        ]);
      if (profileError || !profileRow) {
        return res.status(404).json({ error: "business_profile_not_found" });
      }
      if (settingsError) {
        return res.status(500).json({ error: "automation_settings_load_failed" });
      }

      const settings = automationSettingsRowToDomain(settingsRow);
      if (!settings.dmAutoReplyEnabled) {
        return res.status(400).json({
          error: "automation_disabled",
          message: "Enable DM auto-reply for this profile first, then run again.",
        });
      }

      const engineDeps: AutoReplyDeps = {
        supabaseAdmin,
        zernio,
        resolveOpenAiKey: (bpId) => secretResolver.resolve(bpId, "OPENAI_API_KEY"),
      };
      const summary = await runAutoReplyForProfile(
        engineDeps,
        {
          id: String(profileRow.id),
          name: String(profileRow.name || ""),
          zernioProfileId: profileRow.zernio_profile_id ? String(profileRow.zernio_profile_id) : null,
        },
        settings
      );
      return res.json({ ok: true, summary });
    } catch (e) {
      console.error("[automation] manual run failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "automation_run_failed" });
    }
  });
}
