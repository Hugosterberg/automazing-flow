/**
 * Engagement follow-up — nudge when unread DMs pile up and the workflow is enabled.
 */

import type { ZernioModule } from "../providers/zernioModule.ts";
import {
  parseZernioConversationList,
  zernioConversationUnreadCount,
} from "./zernioInbox.ts";
import { sendEmail } from "./email.ts";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentStore.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export const ENGAGEMENT_NUDGE_LOG_KEY = "engagement-nudge-log";

export async function runEngagementFollowup(deps: {
  supabaseAdmin: SupabaseAdminLike;
  zernio: ZernioModule;
  businessProfileId: string;
  profileName: string;
  zernioProfileId: string;
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ unread: number; emailed: boolean }> {
  const { supabaseAdmin, zernio, businessProfileId, profileName, zernioProfileId, notifyEmail, appUrl } = deps;

  const result = await zernio.listInboxConversations({
    profileId: zernioProfileId,
    limit: 50,
    sortOrder: "desc",
    status: "active",
  });
  if (!result.ok) return { unread: 0, emailed: false };

  const conversations = parseZernioConversationList(result.data);
  const unread = conversations.reduce<number>((sum, c) => {
    if (!c || typeof c !== "object") return sum;
    return sum + zernioConversationUnreadCount(c as Record<string, unknown>);
  }, 0);
  if (unread === 0) return { unread: 0, emailed: false };

  const logDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, ENGAGEMENT_NUDGE_LOG_KEY);
  const lastCount = logDoc?.data && typeof logDoc.data === "object" ? Number((logDoc.data as Record<string, unknown>).lastUnreadCount ?? 0) : 0;
  const lastAt = logDoc?.data && typeof logDoc.data === "object" ? String((logDoc.data as Record<string, unknown>).lastEmailedAt || "") : "";

  const recentlyEmailed = lastAt && Date.now() - Date.parse(lastAt) < 20 * 60 * 60 * 1000;
  if (recentlyEmailed && unread <= lastCount) {
    return { unread, emailed: false };
  }

  let emailed = false;
  if (notifyEmail) {
    const messagesUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/messages` : "/messages";
    const mail = await sendEmail({
      to: notifyEmail,
      subject: `${profileName}: ${unread} unread message${unread === 1 ? "" : "s"} need attention`,
      html:
        `<p>You have ${unread} unread conversation${unread === 1 ? "" : "s"} waiting for a reply.</p>` +
        `<p><a href="${messagesUrl}">Open inbox</a></p>`,
      text: `${unread} unread messages. Open inbox: ${messagesUrl}`,
    });
    emailed = mail.ok;
  }

  await saveProfileDocument(supabaseAdmin, businessProfileId, ENGAGEMENT_NUDGE_LOG_KEY, {
    lastUnreadCount: unread,
    lastEmailedAt: emailed ? new Date().toISOString() : lastAt || null,
  });

  return { unread, emailed };
}

export async function runWeeklyInsightDigest(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  profileName: string;
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ sent: boolean }> {
  const { buildWeeklyInsightDigest } = await import("./weeklyInsightDigest.ts");

  const { data: snaps } = await deps.supabaseAdmin
    .from("marketing_snapshots")
    .select("snapshot_date,roas,portfolio_grade")
    .eq("business_profile_id", deps.businessProfileId)
    .order("snapshot_date", { ascending: false })
    .limit(14);
  const rows = Array.isArray(snaps) ? snaps : [];
  const roasCurrent = rows[0]?.roas == null ? null : Number(rows[0].roas);
  const roasPrevious = rows[1]?.roas == null ? null : Number(rows[1].roas);
  const roasDelta =
    roasCurrent != null && roasPrevious != null && Number.isFinite(roasCurrent) && Number.isFinite(roasPrevious)
      ? roasCurrent - roasPrevious
      : null;
  const portfolioGrade = rows[0]?.portfolio_grade ? String(rows[0].portfolio_grade) : null;

  const postsDoc = await loadProfileDocument(deps.supabaseAdmin, deps.businessProfileId, "scheduled-posts");
  const posts = Array.isArray(postsDoc?.data) ? postsDoc.data : [];
  const weekAgo = Date.now() - 7 * 86400000;
  let postsPublished = 0;
  let postsFailed = 0;
  for (const p of posts) {
    if (!p || typeof p !== "object") continue;
    const updated = Date.parse(String((p as Record<string, unknown>).updatedAt || ""));
    if (!Number.isFinite(updated) || updated < weekAgo) continue;
    const status = String((p as Record<string, unknown>).status || "");
    if (status === "published") postsPublished += 1;
    if (status === "failed") postsFailed += 1;
  }

  const digest = buildWeeklyInsightDigest({
    businessName: deps.profileName,
    appUrl: deps.appUrl,
    portfolioGrade,
    roasCurrent,
    roasDelta: roasDelta,
    postsPublished,
    postsFailed,
    topCaptionHint: postsPublished > 0 ? "Repurpose your best-performing post into a short video clip." : null,
  });

  if (!deps.notifyEmail) return { sent: false };

  const result = await sendEmail({
    to: deps.notifyEmail,
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
  });
  return { sent: result.ok };
}
