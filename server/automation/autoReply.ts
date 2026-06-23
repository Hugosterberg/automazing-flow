/**
 * Auto-reply automation engine (social DMs via the Zernio inbox).
 *
 * For every business profile with `automation_settings.dm_auto_reply_enabled`,
 * the engine lists that tenant's unread inbox conversations (scoped by the
 * tenant's own Zernio profile id), drafts an AI reply for the latest inbound
 * customer message, and — depending on `dm_auto_reply_mode` —
 *
 *   - 'draft': only stores the draft in `auto_reply_log` (human in the loop),
 *   - 'send' : sends the reply through Zernio and logs the outcome.
 *
 * Idempotency: one `auto_reply_log` row per (business_profile_id, kind,
 * external_id) where external_id = "<conversationId>:<messageId>". The engine
 * skips anything already logged, and the DB unique constraint catches races
 * between overlapping runs. Per-conversation and per-tenant failures are
 * isolated; a hard cap (`maxRepliesPerRun`) prevents runaway sends.
 */

import { generateReplyDraft } from "../ai/replyDraft.ts";
import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import { logActivity } from "../lib/activityLog.ts";
import {
  parseZernioConversationList,
  parseZernioConversationMessages,
  firstString,
  zernioConversationAccountIds,
  zernioConversationPlatform,
  zernioConversationId,
  textFromZernioMessage,
  dateFromZernioMessage,
  zernioMessageId,
  zernioConversationUnreadCount,
  isInboundZernioMessage,
} from "../lib/zernioInbox.ts";

export interface AutomationSettings {
  dmAutoReplyEnabled: boolean;
  dmAutoReplyMode: "draft" | "send";
  tone: string;
  language: string;
  instructions: string;
  dailyDigestEnabled: boolean;
  marketingAlertsEnabled: boolean;
  /** Where automated updates are emailed; empty = fall back to profile/owner email. */
  notificationEmail: string;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  dmAutoReplyEnabled: false,
  dmAutoReplyMode: "draft",
  tone: "warm, professional and concise",
  language: "the same language as the message",
  instructions: "",
  dailyDigestEnabled: false,
  marketingAlertsEnabled: false,
  notificationEmail: "",
};

export function automationSettingsRowToDomain(row: Record<string, unknown> | null | undefined): AutomationSettings {
  if (!row) return { ...DEFAULT_AUTOMATION_SETTINGS };
  return {
    dmAutoReplyEnabled: Boolean(row.dm_auto_reply_enabled),
    dmAutoReplyMode: row.dm_auto_reply_mode === "send" ? "send" : "draft",
    tone: String(row.tone || DEFAULT_AUTOMATION_SETTINGS.tone),
    language: String(row.language || DEFAULT_AUTOMATION_SETTINGS.language),
    instructions: String(row.instructions || ""),
    dailyDigestEnabled: Boolean(row.daily_digest_enabled),
    marketingAlertsEnabled: Boolean(row.marketing_alerts_enabled),
    notificationEmail: String(row.notification_email || ""),
  };
}

export interface AutoReplyProfile {
  id: string;
  name: string;
  zernioProfileId: string | null;
}

export interface AutoReplyRunSummary {
  businessProfileId: string;
  scanned: number;
  drafted: number;
  sent: number;
  failed: number;
  skipped: number;
  note?: string;
  errors: string[];
}

/**
 * Minimal Supabase client surface (same pattern as ai/recommendations/producer):
 * the full generic SupabaseClient type adds noise without safety here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder chain is intentionally untyped for brevity
type SupabaseAdminLike = { from: (table: string) => any };

export interface AutoReplyDeps {
  supabaseAdmin: SupabaseAdminLike;
  zernio: Pick<ZernioModule, "listInboxConversations" | "listInboxConversationMessages" | "sendInboxMessage">;
  /** Per-tenant OpenAI key resolution (secretResolver.resolve with env fallback). */
  resolveOpenAiKey: (businessProfileId: string) => Promise<string | null>;
}

const MAX_REPLIES_PER_RUN = 10;
const MAX_CONVERSATIONS_SCANNED = 50;
const MAX_LOGGED_TEXT = 2000;

type DmCandidate = {
  conversationId: string;
  zernioAccountId: string;
  platform: string | null;
  authorName: string;
  text: string;
  externalId: string;
};

/**
 * Extracts an actionable candidate from one unread conversation row, fetching
 * its latest message for direction + idempotency id. Returns null when the
 * conversation can't be safely replied to (no id/account, latest message is
 * outbound, or there is no text to answer).
 */
async function buildDmCandidate(
  zernio: AutoReplyDeps["zernio"],
  row: Record<string, unknown>
): Promise<DmCandidate | null> {
  const conversationId = zernioConversationId(row);
  const zernioAccountId = zernioConversationAccountIds(row)[0] || "";
  if (!conversationId || !zernioAccountId) return null;

  const messageResult = await zernio.listInboxConversationMessages(conversationId, {
    accountId: zernioAccountId,
    limit: 1,
    sortOrder: "desc",
  });
  if (!messageResult.ok) return null;
  const latest = parseZernioConversationMessages(messageResult.data)[0];
  if (!latest) return null;

  // Skip when the latest message is explicitly from the business itself.
  // Unknown direction is tolerated because the conversation is unread, which
  // already implies the customer wrote last.
  if (isInboundZernioMessage(latest) === false) return null;

  const text = textFromZernioMessage(latest) || String(row.lastMessage || row.preview || "").trim();
  if (!text) return null;

  const messageId = zernioMessageId(latest) || dateFromZernioMessage(latest);
  if (!messageId) return null;

  return {
    conversationId,
    zernioAccountId,
    platform: zernioConversationPlatform(row),
    authorName: firstString(row, ["participantName", "participantUsername"]),
    text,
    externalId: `${conversationId}:${messageId}`,
  };
}

export async function runAutoReplyForProfile(
  deps: AutoReplyDeps,
  profile: AutoReplyProfile,
  settings: AutomationSettings,
  options?: { maxRepliesPerRun?: number }
): Promise<AutoReplyRunSummary> {
  const summary: AutoReplyRunSummary = {
    businessProfileId: profile.id,
    scanned: 0,
    drafted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (!settings.dmAutoReplyEnabled) {
    summary.note = "dm_auto_reply_disabled";
    return summary;
  }
  if (!profile.zernioProfileId) {
    summary.note = "no_zernio_profile_for_tenant";
    return summary;
  }

  const conversationsResult = await deps.zernio.listInboxConversations({
    limit: MAX_CONVERSATIONS_SCANNED,
    sortOrder: "desc",
    status: "active",
    profileId: profile.zernioProfileId,
  });
  if (!conversationsResult.ok) {
    summary.note = describeZernioFailure(conversationsResult).message;
    return summary;
  }

  const rows = parseZernioConversationList(conversationsResult.data)
    .filter((raw): raw is Record<string, unknown> => Boolean(raw && typeof raw === "object"))
    .filter((row) => zernioConversationUnreadCount(row) > 0);
  summary.scanned = rows.length;
  if (rows.length === 0) return summary;

  const candidates: DmCandidate[] = [];
  for (const row of rows) {
    const candidate = await buildDmCandidate(deps.zernio, row);
    if (candidate) candidates.push(candidate);
    else summary.skipped += 1;
  }
  if (candidates.length === 0) return summary;

  // One batched idempotency lookup instead of a query per conversation.
  const { data: existingRows, error: existingError } = await deps.supabaseAdmin
    .from("auto_reply_log")
    .select("external_id,status")
    .eq("business_profile_id", profile.id)
    .eq("kind", "dm")
    .in("external_id", candidates.map((c) => c.externalId));
  if (existingError) {
    summary.note = `log_lookup_failed: ${existingError.message}`;
    return summary;
  }
  // Rows with a terminal outcome ('drafted' or 'sent') are never reprocessed.
  // Rows left in 'failed' (e.g. a transient Zernio/send error) stay eligible
  // for retry on a later run instead of being abandoned forever — the prior
  // failed row is overwritten via upsert when the retry produces a result.
  const alreadyHandled = new Set<string>();
  const retryableFailures = new Set<string>();
  for (const raw of existingRows || []) {
    const row = raw as Record<string, unknown>;
    const externalId = String(row.external_id || "");
    if (!externalId) continue;
    if (String(row.status || "") === "failed") retryableFailures.add(externalId);
    else alreadyHandled.add(externalId);
  }

  const maxReplies = Math.max(1, options?.maxRepliesPerRun ?? MAX_REPLIES_PER_RUN);
  let handled = 0;
  const openaiKey = await deps.resolveOpenAiKey(profile.id);

  for (const candidate of candidates) {
    if (alreadyHandled.has(candidate.externalId)) {
      summary.skipped += 1;
      continue;
    }
    if (handled >= maxReplies) {
      summary.skipped += 1;
      continue;
    }
    handled += 1;

    let status: "drafted" | "sent" | "failed" = "drafted";
    let errorText: string | null = null;
    let draftText = "";
    try {
      const draft = await generateReplyDraft(
        {
          kind: "dm",
          text: candidate.text,
          authorName: candidate.authorName,
          businessName: profile.name,
          tone: settings.tone,
          language: settings.language,
          instructions: settings.instructions,
        },
        openaiKey
      );
      draftText = draft.draft;

      if (settings.dmAutoReplyMode === "send") {
        const sendResult = await deps.zernio.sendInboxMessage({
          conversationId: candidate.conversationId,
          accountId: candidate.zernioAccountId,
          message: draftText,
        });
        if (sendResult.ok) {
          status = "sent";
        } else {
          status = "failed";
          errorText = describeZernioFailure(sendResult).message;
        }
      }
    } catch (e) {
      status = "failed";
      errorText = e instanceof Error ? e.message : "auto_reply_failed";
    }

    const logRow = {
      business_profile_id: profile.id,
      kind: "dm",
      external_id: candidate.externalId,
      conversation_id: candidate.conversationId,
      zernio_account_id: candidate.zernioAccountId,
      platform: candidate.platform,
      author_name: candidate.authorName || null,
      incoming_text: candidate.text.slice(0, MAX_LOGGED_TEXT),
      draft_text: draftText.slice(0, MAX_LOGGED_TEXT),
      status,
      error: errorText,
    };
    // Fresh messages use insert so the unique constraint guards against
    // overlapping runs; a previously-failed message is upserted to overwrite
    // its stale failure row with the retry's outcome.
    const { error: insertError } = retryableFailures.has(candidate.externalId)
      ? await deps.supabaseAdmin
          .from("auto_reply_log")
          .upsert(logRow, { onConflict: "business_profile_id,kind,external_id" })
      : await deps.supabaseAdmin.from("auto_reply_log").insert(logRow);
    if (insertError) {
      // 23505 = unique violation: another run handled this message in parallel.
      if (insertError.code === "23505") {
        summary.skipped += 1;
        continue;
      }
      summary.errors.push(`log_insert_failed: ${insertError.message}`);
    }

    if (status === "sent") {
      summary.sent += 1;
      // Surface the auto-reply in the notifications bell / Activity feed.
      void logActivity(deps.supabaseAdmin, {
        businessProfileId: profile.id,
        module: "automation",
        eventType: "auto_reply.sent",
        subjectType: "conversation",
        subjectId: candidate.conversationId,
        severity: "success",
        summary: `Auto-replied to ${candidate.authorName || "a customer"} on ${candidate.platform || "DM"}`,
      });
    } else if (status === "drafted") summary.drafted += 1;
    else {
      summary.failed += 1;
      if (errorText) summary.errors.push(errorText);
    }
  }

  return summary;
}

/**
 * Cron entrypoint: walks every profile with DM auto-reply enabled. Per-tenant
 * failures are isolated so one bad profile cannot abort the whole run, and a
 * time budget keeps the sweep inside the serverless function limit (Vercel
 * maxDuration is 60s) — remaining profiles are reported as skipped and picked
 * up by the next run, which is safe because the engine is idempotent.
 */
export async function runAutoReplyForAllProfiles(
  deps: AutoReplyDeps,
  options?: { timeBudgetMs?: number }
): Promise<{ profiles: number; skippedForTime: number; summaries: AutoReplyRunSummary[] }> {
  const startedAt = Date.now();
  const timeBudgetMs = Math.max(5_000, options?.timeBudgetMs ?? 50_000);
  const { data: settingsRows, error: settingsError } = await deps.supabaseAdmin
    .from("automation_settings")
    .select("business_profile_id,dm_auto_reply_enabled,dm_auto_reply_mode,tone,language,instructions")
    .eq("dm_auto_reply_enabled", true);
  if (settingsError) {
    throw new Error(`automation_settings select failed: ${settingsError.message}`);
  }

  const rows = (settingsRows || []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { profiles: 0, skippedForTime: 0, summaries: [] };

  const profileIds = rows.map((r) => String(r.business_profile_id || "")).filter(Boolean);
  const { data: profileRows, error: profileError } = await deps.supabaseAdmin
    .from("business_profiles")
    .select("id,name,zernio_profile_id")
    .in("id", profileIds);
  if (profileError) {
    throw new Error(`business_profiles select failed: ${profileError.message}`);
  }
  const profileById = new Map(
    ((profileRows || []) as Array<Record<string, unknown>>).map((p) => [String(p.id), p])
  );

  const summaries: AutoReplyRunSummary[] = [];
  let skippedForTime = 0;
  for (const settingsRow of rows) {
    const businessProfileId = String(settingsRow.business_profile_id || "");
    const profileRow = profileById.get(businessProfileId);
    if (!profileRow) continue;
    if (Date.now() - startedAt > timeBudgetMs) {
      skippedForTime += 1;
      continue;
    }
    try {
      const summary = await runAutoReplyForProfile(
        deps,
        {
          id: businessProfileId,
          name: String(profileRow.name || ""),
          zernioProfileId: profileRow.zernio_profile_id ? String(profileRow.zernio_profile_id) : null,
        },
        automationSettingsRowToDomain(settingsRow)
      );
      summaries.push(summary);
    } catch (e) {
      summaries.push({
        businessProfileId,
        scanned: 0,
        drafted: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        note: e instanceof Error ? e.message.slice(0, 200) : "auto_reply_run_failed",
        errors: [],
      });
    }
  }

  if (skippedForTime > 0) {
    console.warn(
      `[auto-reply] time budget ${timeBudgetMs}ms exhausted — ${skippedForTime} profile(s) deferred to the next run`
    );
  }
  return { profiles: rows.length, skippedForTime, summaries };
}
