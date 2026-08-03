/**
 * End-to-end flow automations — sales outreach drafts, content pipeline, cart recovery.
 * Each job is opt-in via `job_schedules` and writes durable state to profile_documents.
 */

import crypto from "node:crypto";
import { heuristicOutreachDraft } from "../ai/outreachDraft.ts";
import { generateReplyDraft } from "../ai/replyDraft.ts";
import type { ZernioModule } from "../providers/zernioModule.ts";
import { fetchGmailAccountData } from "../providers/gmail.ts";
import { fetchOutlookMailData } from "../providers/outlookMail.ts";
import {
  fetchShopifyAbandonedCheckouts,
  fetchShopifyFulfilledOrders,
  fetchShopifyDormantCustomers,
} from "../providers/shopify.ts";
import {
  fetchJudgemeReviews,
  judgemeCredentialsFromStored,
  sendJudgemeReviewRequest,
  type JudgemeCredentials,
} from "../providers/judgeme.ts";
import {
  loadProfileDocument,
  saveProfileDocument,
  type ProfileDocumentRow,
} from "./profileDocumentStore.ts";
import {
  parseScheduledPostsDoc,
  type StoredScheduledPost,
} from "./scheduledPostsPublisher.ts";
import { isJobEnabledForProfile, type JobSchedulesMap } from "./profileJobSchedule.ts";
import { sendEmail, type EmailResult } from "./email.ts";
import { escapeHtml } from "./htmlEscape.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export const OUTREACH_QUEUE_DOC_KEY = "outreach-queue";
export const SOCIAL_WORKFLOWS_DOC_KEY = "social-workflows";
export const CONTENT_PIPELINE_DOC_KEY = "content-pipeline-queue";
export const CART_RECOVERY_SENT_DOC_KEY = "cart-recovery-sent";
export const POST_PURCHASE_REVIEW_SENT_DOC_KEY = "post-purchase-review-sent";
export const CUSTOMER_WINBACK_SENT_DOC_KEY = "customer-winback-sent";
export const REVIEW_REPLY_QUEUE_DOC_KEY = "review-reply-queue";
export const NEGATIVE_REVIEW_ALERTS_DOC_KEY = "negative-review-alerts";
export const MAIL_REPLY_QUEUE_DOC_KEY = "mail-reply-queue";

export interface ReviewReplyQueueItem {
  id: string;
  reviewId: string;
  accountId: string;
  author: string;
  rating?: number;
  reviewText: string;
  draft: string;
  status: "draft" | "sent";
  createdAt: string;
}

export interface MailReplyQueueItem {
  id: string;
  messageKey: string;
  accountId: string;
  platform: "gmail" | "outlook";
  providerMessageId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  draft: string;
  status: "draft" | "sent" | "dismissed";
  createdAt: string;
}

export interface OutreachQueueItem {
  id: string;
  leadId: string;
  leadName: string;
  prospectEmail?: string;
  subject?: string;
  body: string;
  status: "draft" | "sent";
  createdAt: string;
}

export interface ContentPipelineItem {
  id: string;
  title: string;
  captionHint?: string;
  accountIds: string[];
  platforms: string[];
  mediaUrls: string[];
  scheduledFor: string;
  status: "queued" | "scheduled" | "failed";
  error?: string;
  createdAt: string;
}

export interface SocialWorkflowsDoc {
  enabled: Record<string, boolean>;
  lastPipelineRunAt?: string;
}

export interface CartRecoverySentDoc {
  checkoutIds: string[];
  lastRunAt?: string;
}

interface LeadRow {
  id: string;
  name?: string;
  email?: string;
  company?: string;
  status?: string;
  next_follow_up_at?: string;
}

interface BusinessProfileRow {
  id: string;
  name?: string;
  email?: string;
  owner_user_id?: string;
}

interface TokenStoreLike {
  get(accountId: string): Promise<Record<string, unknown> | null | undefined>;
  set?(accountId: string, value: Record<string, unknown>): Promise<unknown>;
}

function parseOutreachQueue(data: unknown): OutreachQueueItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is OutreachQueueItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as OutreachQueueItem).id === "string" &&
      typeof (e as OutreachQueueItem).leadId === "string"
  );
}

function parseContentPipeline(data: unknown): ContentPipelineItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is ContentPipelineItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as ContentPipelineItem).id === "string" &&
      typeof (e as ContentPipelineItem).title === "string"
  );
}

function parseCartRecoverySent(data: unknown): CartRecoverySentDoc {
  if (!data || typeof data !== "object") return { checkoutIds: [] };
  const raw = data as Record<string, unknown>;
  const ids = Array.isArray(raw.checkoutIds)
    ? raw.checkoutIds.map((id) => String(id)).filter(Boolean)
    : [];
  return { checkoutIds: ids, lastRunAt: raw.lastRunAt ? String(raw.lastRunAt) : undefined };
}

function parseSocialWorkflows(data: unknown): SocialWorkflowsDoc {
  if (!data || typeof data !== "object") return { enabled: {} };
  const raw = data as Record<string, unknown>;
  const enabled =
    raw.enabled && typeof raw.enabled === "object" && !Array.isArray(raw.enabled)
      ? (raw.enabled as Record<string, boolean>)
      : {};
  return {
    enabled,
    lastPipelineRunAt: raw.lastPipelineRunAt ? String(raw.lastPipelineRunAt) : undefined,
  };
}

function heuristicCaption(title: string, hint?: string): string {
  const base = title.trim() || "New post";
  if (hint?.trim()) return `${base}\n\n${hint.trim()}`;
  return `${base} — tap the link in bio to learn more.`;
}

function defaultScheduleIso(hoursFromNow = 2): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

export interface FlowJobResult {
  profiles: number;
  processed: number;
  skipped: number;
  failed: number;
}

export interface SalesOutreachResult extends FlowJobResult {
  drafted: number;
  notified: number;
}

export interface ContentPipelineResult extends FlowJobResult {
  scheduled: number;
}

export interface CartRecoveryResult extends FlowJobResult {
  emailed: number;
}

export function isFlowJobEnabled(
  key: string,
  schedules: JobSchedulesMap,
  legacy?: { dailyDigestEnabled?: boolean }
): boolean {
  return isJobEnabledForProfile(key, schedules, legacy);
}

/** Auto-draft outreach for due leads → outreach-queue profile doc. */
export async function runSalesOutreachAuto(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  profile: BusinessProfileRow;
  schedules: JobSchedulesMap;
  endOfToday: Date;
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ drafted: number; notified: boolean }> {
  const { supabaseAdmin, businessProfileId, profile, endOfToday, notifyEmail, appUrl } = deps;

  const { data: leadRows, error } = await supabaseAdmin
    .from("leads")
    .select("id,name,email,company,status,next_follow_up_at")
    .eq("business_profile_id", businessProfileId)
    .in("status", ["new", "contacted", "qualified"])
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", endOfToday.toISOString());
  if (error) throw new Error(error.message);

  const leads = (Array.isArray(leadRows) ? leadRows : []) as LeadRow[];
  if (leads.length === 0) return { drafted: 0, notified: false };

  const existingDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, OUTREACH_QUEUE_DOC_KEY);
  const queue = parseOutreachQueue(existingDoc?.data);
  const queuedLeadIds = new Set(queue.filter((q) => q.status === "draft").map((q) => q.leadId));

  let drafted = 0;
  const newItems: OutreachQueueItem[] = [];

  for (const lead of leads.slice(0, 10)) {
    const leadId = String(lead.id || "");
    if (!leadId || queuedLeadIds.has(leadId)) continue;

    const draft = heuristicOutreachDraft(
      {
        businessName: String(profile.name || "Our team"),
        prospectCompany: String(lead.company || lead.name || "prospect"),
        prospectContact: String(lead.name || ""),
        prospectEmail: lead.email ? String(lead.email) : undefined,
        prospectReason: "scheduled follow-up is due",
      },
      "email"
    );

    newItems.push({
      id: crypto.randomUUID(),
      leadId,
      leadName: String(lead.name || lead.company || "Lead"),
      prospectEmail: lead.email ? String(lead.email) : undefined,
      subject: draft.subject,
      body: draft.body,
      status: "draft",
      createdAt: new Date().toISOString(),
    });
    drafted += 1;
  }

  if (newItems.length === 0) return { drafted: 0, notified: false };

  const nextQueue = [...newItems, ...queue].slice(0, 50);
  await saveProfileDocument(supabaseAdmin, businessProfileId, OUTREACH_QUEUE_DOC_KEY, nextQueue);

  let notified = false;
  if (notifyEmail && drafted > 0) {
    const salesUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/sales` : "/sales";
    const result = await sendEmail({
      to: notifyEmail,
      subject: `${profile.name || "Your business"}: ${drafted} outreach draft${drafted === 1 ? "" : "s"} ready`,
      html:
        `<p>${drafted} follow-up outreach draft${drafted === 1 ? " is" : "s are"} ready in your Sales queue.</p>` +
        `<p><a href="${salesUrl}">Review drafts in Sales</a></p>`,
      text: `${drafted} outreach draft(s) ready. Open Sales: ${salesUrl}`,
    });
    notified = result.ok;
  }

  return { drafted, notified };
}

const STALE_LEAD_DAYS = 10;

/** Auto-draft win-back outreach for open leads gone quiet (no follow-up date). */
export async function runStaleLeadOutreach(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  profile: BusinessProfileRow;
  notifyEmail?: string;
  appUrl?: string;
  now?: Date;
}): Promise<{ drafted: number; notified: boolean }> {
  const { supabaseAdmin, businessProfileId, profile, notifyEmail, appUrl } = deps;
  const nowMs = (deps.now ?? new Date()).getTime();

  const { data: leadRows, error } = await supabaseAdmin
    .from("leads")
    .select("id,name,email,company,status,next_follow_up_at,updated_at,created_at")
    .eq("business_profile_id", businessProfileId)
    .in("status", ["new", "contacted", "qualified"])
    .is("next_follow_up_at", null);
  if (error) throw new Error(error.message);

  const leads = (Array.isArray(leadRows) ? leadRows : []) as Array<
    LeadRow & { updated_at?: string; created_at?: string }
  >;
  const staleLeads = leads.filter((lead) => {
    const touched = Date.parse(String(lead.updated_at || lead.created_at || ""));
    if (!Number.isFinite(touched)) return false;
    return Math.floor((nowMs - touched) / 86400000) >= STALE_LEAD_DAYS;
  });
  if (staleLeads.length === 0) return { drafted: 0, notified: false };

  const existingDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, OUTREACH_QUEUE_DOC_KEY);
  const queue = parseOutreachQueue(existingDoc?.data);
  const queuedLeadIds = new Set(queue.filter((q) => q.status === "draft").map((q) => q.leadId));

  let drafted = 0;
  const newItems: OutreachQueueItem[] = [];

  for (const lead of staleLeads.slice(0, 5)) {
    const leadId = String(lead.id || "");
    if (!leadId || queuedLeadIds.has(leadId)) continue;
    const touched = Date.parse(String(lead.updated_at || lead.created_at || ""));
    const daysQuiet = Number.isFinite(touched) ? Math.floor((nowMs - touched) / 86400000) : STALE_LEAD_DAYS;

    const draft = heuristicOutreachDraft(
      {
        businessName: String(profile.name || "Our team"),
        prospectCompany: String(lead.company || lead.name || "prospect"),
        prospectContact: String(lead.name || ""),
        prospectEmail: lead.email ? String(lead.email) : undefined,
        prospectReason: `no touch in ${daysQuiet} days — gentle re-engagement`,
      },
      "email"
    );

    newItems.push({
      id: crypto.randomUUID(),
      leadId,
      leadName: String(lead.name || lead.company || "Lead"),
      prospectEmail: lead.email ? String(lead.email) : undefined,
      subject: draft.subject,
      body: draft.body,
      status: "draft",
      createdAt: new Date().toISOString(),
    });
    drafted += 1;
  }

  if (newItems.length === 0) return { drafted: 0, notified: false };

  const nextQueue = [...newItems, ...queue].slice(0, 50);
  await saveProfileDocument(supabaseAdmin, businessProfileId, OUTREACH_QUEUE_DOC_KEY, nextQueue);

  let notified = false;
  if (notifyEmail && drafted > 0) {
    const salesUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/sales` : "/sales";
    const result = await sendEmail({
      to: notifyEmail,
      subject: `${profile.name || "Your business"}: ${drafted} stale lead draft${drafted === 1 ? "" : "s"} ready`,
      html:
        `<p>${drafted} re-engagement draft${drafted === 1 ? "" : "s"} for quiet leads ${drafted === 1 ? "is" : "are"} ready in Sales.</p>` +
        `<p><a href="${salesUrl}">Review drafts in Sales</a></p>`,
      text: `${drafted} stale lead draft(s) ready. Open Sales: ${salesUrl}`,
    });
    notified = result.ok;
  }

  return { drafted, notified };
}
export async function runContentPipeline(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  schedules: JobSchedulesMap;
  businessName?: string;
}): Promise<{ scheduled: number; skipped: number; seeded?: number }> {
  const { supabaseAdmin, businessProfileId } = deps;

  const { runContentCreativeSeed, buildOptimizedCaption } = await import("./contentCreativeJobs.ts");
  await runContentCreativeSeed({
    supabaseAdmin,
    businessProfileId,
    businessName: deps.businessName,
  });

  const workflowsDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, SOCIAL_WORKFLOWS_DOC_KEY);
  const workflows = parseSocialWorkflows(workflowsDoc?.data);
  const captionOptimizer = Boolean(workflows.enabled["caption-hashtag-optimizer"]);
  const pipelineEnabled =
    workflows.enabled["repurpose-weekly-hero"] ||
    workflows.enabled["caption-hashtag-optimizer"] ||
    workflows.enabled["weekly-insight-digest"] ||
    workflows.enabled["content-gap-filler"] ||
    workflows.enabled["evergreen-repost"];

  const pipelineDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, CONTENT_PIPELINE_DOC_KEY);
  const queue = parseContentPipeline(pipelineDoc?.data);
  const pending = queue.filter((item) => item.status === "queued");

  if (!pipelineEnabled && pending.length === 0) {
    return { scheduled: 0, skipped: 1 };
  }

  if (pending.length === 0) {
    return { scheduled: 0, skipped: 0 };
  }

  const postsDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, "scheduled-posts");
  const posts = parseScheduledPostsDoc(postsDoc?.data);
  let scheduled = 0;
  const nowIso = new Date().toISOString();

  const nextQueue = queue.map((item) => {
    if (item.status !== "queued") return item;
    if (scheduled >= 5) return item;

    const caption = captionOptimizer
      ? buildOptimizedCaption(item.title, item.captionHint, item.platforms)
      : heuristicCaption(item.title, item.captionHint);
    const post: StoredScheduledPost = {
      id: crypto.randomUUID(),
      caption,
      accountIds: Array.isArray(item.accountIds) ? item.accountIds : [],
      platforms: Array.isArray(item.platforms) ? item.platforms : [],
      status: "scheduled",
      scheduledFor: item.scheduledFor || defaultScheduleIso(2 + scheduled),
      mediaUrls: Array.isArray(item.mediaUrls) ? item.mediaUrls : [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    posts.unshift(post);
    scheduled += 1;
    return { ...item, status: "scheduled" as const };
  });

  if (scheduled === 0) return { scheduled: 0, skipped: 0 };

  await saveProfileDocument(supabaseAdmin, businessProfileId, "scheduled-posts", posts.slice(0, 100));
  await saveProfileDocument(supabaseAdmin, businessProfileId, CONTENT_PIPELINE_DOC_KEY, nextQueue);

  const mergedWorkflows: SocialWorkflowsDoc = {
    ...workflows,
    lastPipelineRunAt: nowIso,
  };
  await saveProfileDocument(supabaseAdmin, businessProfileId, SOCIAL_WORKFLOWS_DOC_KEY, mergedWorkflows);

  return { scheduled, skipped: 0 };
}

/** Send recovery emails for recent abandoned Shopify checkouts (deduped). */
export async function runCartRecovery(deps: {
  supabaseAdmin: SupabaseAdminLike;
  tokenStore: TokenStoreLike;
  businessProfileId: string;
  profile: BusinessProfileRow;
  shopAccountId: string;
  accessToken: string;
  shop: string;
}): Promise<{ emailed: number; skipped: number }> {
  const { supabaseAdmin, businessProfileId, profile, accessToken, shop } = deps;

  const checkouts = await fetchShopifyAbandonedCheckouts(accessToken, shop, 7, 15);
  if (checkouts.length === 0) return { emailed: 0, skipped: 0 };

  const sentDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, CART_RECOVERY_SENT_DOC_KEY);
  const sent = parseCartRecoverySent(sentDoc?.data);
  const sentIds = new Set(sent.checkoutIds);

  let emailed = 0;
  let skipped = 0;
  const newSentIds: string[] = [...sent.checkoutIds];

  for (const checkout of checkouts.slice(0, 5)) {
    if (sentIds.has(checkout.id)) {
      skipped += 1;
      continue;
    }

    const draft = heuristicOutreachDraft(
      {
        businessName: String(profile.name || "Our store"),
        prospectEmail: checkout.email,
        prospectNotes: `Abandoned checkout worth ${checkout.total} ${checkout.currency}. Recovery link: ${checkout.recoveryUrl || "n/a"}`,
        prospectReason: "recover abandoned cart",
      },
      "email"
    );

    const subject = draft.subject || "Complete your order";
    const body =
      draft.body +
      (checkout.recoveryUrl ? `\n\nComplete your order: ${checkout.recoveryUrl}` : "");

    const result: EmailResult = await sendEmail({
      to: checkout.email,
      subject,
      html: `<div style="font-family:sans-serif;white-space:pre-wrap">${body.replace(/\n/g, "<br>")}</div>`,
      text: body,
    });

    if (result.ok) {
      emailed += 1;
      newSentIds.push(checkout.id);
    } else if (result.skipped) {
      return { emailed: 0, skipped: checkouts.length };
    }
  }

  if (newSentIds.length > sent.checkoutIds.length) {
    const trimmed = newSentIds.slice(-200);
    await saveProfileDocument(supabaseAdmin, businessProfileId, CART_RECOVERY_SENT_DOC_KEY, {
      checkoutIds: trimmed,
      lastRunAt: new Date().toISOString(),
    });
  }

  return { emailed, skipped };
}

interface SentIdsDoc {
  ids: string[];
  lastRunAt?: string;
}

function parseSentIdsDoc(data: unknown): SentIdsDoc {
  if (!data || typeof data !== "object") return { ids: [] };
  const raw = data as Record<string, unknown>;
  const ids = Array.isArray(raw.ids) ? raw.ids.map((id) => String(id)).filter(Boolean) : [];
  return { ids, lastRunAt: raw.lastRunAt ? String(raw.lastRunAt) : undefined };
}

const POST_PURCHASE_REVIEW_MIN_DAYS = 10;
const POST_PURCHASE_REVIEW_MAX_DAYS = 24;

/**
 * Email customers a review-request a couple of weeks after a fulfilled,
 * paid order (deduped per order id, direct-send — this is a low-stakes,
 * non-financial nudge, not one of the "suggest, then approve" actions).
 */
export async function runPostPurchaseReviewRequest(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  profile: BusinessProfileRow;
  accessToken: string;
  shop: string;
  storefrontUrl?: string | null;
  /**
   * When Judge.me is connected for the profile, requests go through Judge.me's
   * own branded review-request email (with the review form + reminders)
   * instead of our plain email. Falls back to email per order on failure.
   */
  judgeme?: JudgemeCredentials | null;
}): Promise<{ emailed: number; skipped: number }> {
  const { supabaseAdmin, businessProfileId, profile, accessToken, shop, storefrontUrl, judgeme } = deps;

  const orders = await fetchShopifyFulfilledOrders(accessToken, shop, {
    minDaysAgo: POST_PURCHASE_REVIEW_MIN_DAYS,
    maxDaysAgo: POST_PURCHASE_REVIEW_MAX_DAYS,
    limit: 30,
  });
  if (orders.length === 0) return { emailed: 0, skipped: 0 };

  const sentDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, POST_PURCHASE_REVIEW_SENT_DOC_KEY);
  const sent = parseSentIdsDoc(sentDoc?.data);
  const sentIds = new Set(sent.ids);

  const businessName = String(profile.name || "our store");
  let emailed = 0;
  let skipped = 0;
  const newSentIds: string[] = [...sent.ids];

  for (const order of orders.slice(0, 8)) {
    if (sentIds.has(order.id)) {
      skipped += 1;
      continue;
    }

    if (judgeme) {
      const judgemeResult = await sendJudgemeReviewRequest(judgeme, {
        orderId: order.id,
        email: order.email,
        name: order.customerName || undefined,
      });
      if (judgemeResult.ok) {
        emailed += 1;
        newSentIds.push(order.id);
        continue;
      }
      // Fall through to the plain email for this order.
    }

    const firstName = (order.customerName || "").split(" ")[0] || "there";
    const subject = `How was your order from ${businessName}?`;
    const body =
      `Hi ${firstName},\n\n` +
      `Thanks again for your order ${order.name} from ${businessName}! We hope you're enjoying it.\n\n` +
      `Would you mind sharing a quick review of your experience? Just reply to this email — we read every word.` +
      (storefrontUrl ? `\n\nVisit us again: ${storefrontUrl}` : "") +
      `\n\nThank you!\n${businessName}`;

    const result: EmailResult = await sendEmail({
      to: order.email,
      subject,
      html: `<div style="font-family:sans-serif;white-space:pre-wrap">${body.replace(/\n/g, "<br>")}</div>`,
      text: body,
    });

    if (result.ok) {
      emailed += 1;
      newSentIds.push(order.id);
    } else if (result.skipped) {
      skipped += 1;
      // No email transport. With Judge.me connected the remaining orders can
      // still be served by it, so only abort the whole run when email was the
      // only available path.
      if (!judgeme) break;
    }
  }

  if (newSentIds.length > sent.ids.length) {
    await saveProfileDocument(supabaseAdmin, businessProfileId, POST_PURCHASE_REVIEW_SENT_DOC_KEY, {
      ids: newSentIds.slice(-500),
      lastRunAt: new Date().toISOString(),
    });
  }

  return { emailed, skipped };
}

const CUSTOMER_WINBACK_MIN_DORMANT_DAYS = 60;
const CUSTOMER_WINBACK_MAX_DORMANT_DAYS = 180;
/** Don't re-target the same dormant customer more often than this. */
const CUSTOMER_WINBACK_COOLDOWN_DAYS = 90;

/**
 * Email past customers who have gone quiet a gentle win-back nudge (deduped
 * per customer id with a cooldown so the same person isn't re-emailed every
 * run). Direct-send, like cart recovery — a discount-free "we miss you"
 * touch, not a costly/financial action.
 */
export async function runCustomerWinback(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  profile: BusinessProfileRow;
  accessToken: string;
  shop: string;
  storefrontUrl?: string | null;
}): Promise<{ emailed: number; skipped: number }> {
  const { supabaseAdmin, businessProfileId, profile, accessToken, shop, storefrontUrl } = deps;

  const customers = await fetchShopifyDormantCustomers(accessToken, shop, {
    minDaysDormant: CUSTOMER_WINBACK_MIN_DORMANT_DAYS,
    maxDaysDormant: CUSTOMER_WINBACK_MAX_DORMANT_DAYS,
    limit: 100,
  });
  if (customers.length === 0) return { emailed: 0, skipped: 0 };

  const sentDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, CUSTOMER_WINBACK_SENT_DOC_KEY);
  const rawSentAt =
    sentDoc?.data && typeof sentDoc.data === "object" && !Array.isArray(sentDoc.data)
      ? ((sentDoc.data as Record<string, unknown>).sentAt as Record<string, string> | undefined)
      : undefined;
  const sentAtByCustomer = new Map<string, number>(
    Object.entries(rawSentAt || {}).map(([id, iso]) => [id, Date.parse(iso)])
  );

  const businessName = String(profile.name || "our store");
  const now = Date.now();
  let emailed = 0;
  let skipped = 0;
  const nextSentAt: Record<string, string> = { ...(rawSentAt || {}) };

  for (const customer of customers.slice(0, 8)) {
    const lastSentMs = sentAtByCustomer.get(customer.id);
    if (lastSentMs && Number.isFinite(lastSentMs) && now - lastSentMs < CUSTOMER_WINBACK_COOLDOWN_DAYS * 86400000) {
      skipped += 1;
      continue;
    }

    const firstName = customer.name.split(" ")[0] || "there";
    const subject = `We miss you at ${businessName}`;
    const body =
      `Hi ${firstName},\n\n` +
      `It's been a while since your last order with ${businessName} — we wanted to check in and say hello.\n\n` +
      `Take a look at what's new when you have a moment.` +
      (storefrontUrl ? ` ${storefrontUrl}` : "") +
      `\n\nWe'd love to have you back!\n${businessName}`;

    const result: EmailResult = await sendEmail({
      to: customer.email,
      subject,
      html: `<div style="font-family:sans-serif;white-space:pre-wrap">${body.replace(/\n/g, "<br>")}</div>`,
      text: body,
    });

    if (result.ok) {
      emailed += 1;
      nextSentAt[customer.id] = new Date().toISOString();
    } else if (result.skipped) {
      return { emailed: 0, skipped: customers.length };
    }
  }

  if (emailed > 0) {
    // Trim to the 500 most recently emailed customers so the doc doesn't grow unbounded.
    const trimmedEntries = Object.entries(nextSentAt)
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
      .slice(0, 500);
    await saveProfileDocument(supabaseAdmin, businessProfileId, CUSTOMER_WINBACK_SENT_DOC_KEY, {
      sentAt: Object.fromEntries(trimmedEntries),
      lastRunAt: new Date().toISOString(),
    });
  }

  return { emailed, skipped };
}

export function countPendingOutreachDrafts(data: unknown): number {
  return parseOutreachQueue(data).filter((q) => q.status === "draft").length;
}

export function mergeOutreachQueueDoc(existing: ProfileDocumentRow | null, items: OutreachQueueItem[]): unknown {
  const queue = parseOutreachQueue(existing?.data);
  return [...items, ...queue].slice(0, 50);
}

function parseReviewReplyQueue(data: unknown): ReviewReplyQueueItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is ReviewReplyQueueItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as ReviewReplyQueueItem).id === "string" &&
      typeof (e as ReviewReplyQueueItem).reviewId === "string"
  );
}

function parseRepliedIds(data: unknown): Set<string> {
  if (!data || typeof data !== "object") return new Set();
  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.repliedIds)) return new Set();
  return new Set(raw.repliedIds.map((id) => String(id)).filter(Boolean));
}

function extractReviewsFromZernioPayload(payload: unknown): Array<{
  id: string;
  author: string;
  rating?: number;
  text: string;
}> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const list =
    (Array.isArray(root.reviews) ? root.reviews : null) ??
    (root.data && typeof root.data === "object" && Array.isArray((root.data as Record<string, unknown>).reviews)
      ? ((root.data as Record<string, unknown>).reviews as unknown[])
      : null) ??
    (Array.isArray(root.data) ? root.data : []);
  if (!Array.isArray(list)) return [];
  return list
    .map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const reviewer = r.reviewer && typeof r.reviewer === "object" ? (r.reviewer as Record<string, unknown>) : {};
      return {
        id: String(r.id || r.reviewId || r.name || i),
        author: String(r.authorName || r.author || reviewer.displayName || reviewer.name || "Anonymous"),
        rating: r.rating != null ? Number(r.rating) : r.starRating != null ? Number(r.starRating) : undefined,
        text: String(r.comment || r.text || r.content || "").trim(),
      };
    })
    .filter((r) => r.text.length > 0);
}

export function countPendingReviewReplyDrafts(data: unknown): number {
  return parseReviewReplyQueue(data).filter((q) => q.status === "draft").length;
}

/** Auto-draft public review replies into review-reply-queue (never auto-posts). */
export async function runReviewReplyAuto(deps: {
  supabaseAdmin: SupabaseAdminLike;
  tokenStore: TokenStoreLike;
  zernio: ZernioModule;
  businessProfileId: string;
  profile: BusinessProfileRow;
  openaiKey?: string | null;
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ drafted: number; notified: boolean; urgentAlerts: number }> {
  const { supabaseAdmin, tokenStore, zernio, businessProfileId, profile, openaiKey, notifyEmail, appUrl } = deps;

  const { data: accountRows } = await supabaseAdmin
    .from("connected_accounts")
    .select("id,platform,disconnected_at")
    .eq("business_profile_id", businessProfileId)
    .in("platform", ["google_reviews", "tripadvisor", "judgeme"])
    .is("disconnected_at", null);
  const accounts = Array.isArray(accountRows) ? accountRows : [];
  if (accounts.length === 0) return { drafted: 0, notified: false, urgentAlerts: 0 };

  const repliedDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, "review-replies");
  const repliedIds = parseRepliedIds(repliedDoc?.data);
  const queueDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, REVIEW_REPLY_QUEUE_DOC_KEY);
  const queue = parseReviewReplyQueue(queueDoc?.data);
  const queuedReviewIds = new Set(queue.filter((q) => q.status === "draft").map((q) => q.reviewId));
  const alertDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, NEGATIVE_REVIEW_ALERTS_DOC_KEY);
  const alertedIds = parseRepliedIds(alertDoc?.data);

  const newItems: ReviewReplyQueueItem[] = [];
  const businessName = String(profile.name || "Our business");
  let urgentAlerts = 0;
  const newUrgent: Array<{ author: string; rating?: number; text: string }> = [];

  for (const row of accounts) {
    const accountId = String(row?.id || "");
    if (!accountId) continue;
    const stored = await tokenStore.get(accountId);

    let reviews: Array<{ id: string; author: string; rating?: number; text: string }>;
    if (String(row?.platform || "") === "judgeme") {
      // Judge.me reviews come straight from the official API — no Zernio hop.
      const creds = judgemeCredentialsFromStored(stored as Record<string, unknown> | null);
      if (!creds) continue;
      const judgemeResult = await fetchJudgemeReviews(creds, { perPage: 30 });
      if (judgemeResult.ok === false) continue;
      reviews = (judgemeResult.reviews ?? [])
        .filter((r) => !r.hidden && r.text.trim().length > 0)
        .map((r) => ({ id: r.id, author: r.author, rating: r.rating, text: r.text }));
    } else {
      const zernioAccountId = String(stored?.zernioAccountId || stored?.lateAccountId || "").trim();
      if (!zernioAccountId) continue;

      const reviewsResult = await zernio.listReviews(zernioAccountId, {
        candidates: ["generic", "account_nested", "google_business", "tripadvisor"],
      });
      if (!reviewsResult.ok) continue;

      reviews = extractReviewsFromZernioPayload(reviewsResult.data);
    }
    for (const review of reviews) {
      const rating = review.rating != null ? Number(review.rating) : undefined;
      if (
        rating != null &&
        rating <= 2 &&
        !alertedIds.has(review.id) &&
        !repliedIds.has(review.id)
      ) {
        newUrgent.push({ author: review.author, rating, text: review.text.slice(0, 200) });
        alertedIds.add(review.id);
      }
    }

    for (const review of reviews) {
      if (newItems.length >= 3) break;
      if (repliedIds.has(review.id) || queuedReviewIds.has(review.id)) continue;

      const { draft } = await generateReplyDraft(
        {
          kind: "review",
          text: review.text,
          authorName: review.author,
          rating: review.rating,
          businessName,
        },
        openaiKey
      );

      newItems.push({
        id: crypto.randomUUID(),
        reviewId: review.id,
        accountId,
        author: review.author,
        rating: review.rating,
        reviewText: review.text,
        draft,
        status: "draft",
        createdAt: new Date().toISOString(),
      });
      queuedReviewIds.add(review.id);
    }
  }

  if (newUrgent.length > 0 && notifyEmail) {
    const reviewsUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/reviews` : "/reviews";
    const lines = newUrgent
      .map((r) => `• ${r.rating ?? "?"}★ from ${r.author}: "${r.text}"`)
      .join("\n");
    const alertResult = await sendEmail({
      to: notifyEmail,
      subject: `⚠ ${businessName}: ${newUrgent.length} urgent review${newUrgent.length === 1 ? "" : "s"} (≤2★)`,
      html:
        `<p><strong>${newUrgent.length} low-star review${newUrgent.length === 1 ? "" : "s"} need immediate attention.</strong></p>` +
        `<pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(lines)}</pre>` +
        `<p><a href="${reviewsUrl}">Open Reviews</a></p>`,
      text: `${newUrgent.length} urgent review(s):\n${lines}\nOpen Reviews: ${reviewsUrl}`,
    });
    if (alertResult.ok) urgentAlerts = newUrgent.length;
    await saveProfileDocument(supabaseAdmin, businessProfileId, NEGATIVE_REVIEW_ALERTS_DOC_KEY, {
      repliedIds: [...alertedIds],
      lastAlertAt: new Date().toISOString(),
    });
  }

  if (newItems.length === 0) return { drafted: 0, notified: false, urgentAlerts };

  const nextQueue = [...newItems, ...queue].slice(0, 50);
  await saveProfileDocument(supabaseAdmin, businessProfileId, REVIEW_REPLY_QUEUE_DOC_KEY, nextQueue);

  const pendingCount = nextQueue.filter((q) => q.status === "draft").length;
  await saveProfileDocument(supabaseAdmin, businessProfileId, "review-replies", {
    repliedIds: [...repliedIds],
    pendingCount,
    updatedAt: new Date().toISOString(),
  });

  let notified = false;
  if (notifyEmail && newItems.length > 0) {
    const reviewsUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/reviews` : "/reviews";
    const result = await sendEmail({
      to: notifyEmail,
      subject: `${businessName}: ${newItems.length} review repl${newItems.length === 1 ? "y" : "ies"} ready`,
      html:
        `<p>${newItems.length} automated review repl${newItems.length === 1 ? "y is" : "ies are"} ready for your approval.</p>` +
        `<p><a href="${reviewsUrl}">Review and send on Reviews</a></p>`,
      text: `${newItems.length} review reply draft(s) ready. Open Reviews: ${reviewsUrl}`,
    });
    notified = result.ok;
  }

  return { drafted: newItems.length, notified, urgentAlerts };
}

export function parseMailReplyQueue(data: unknown): MailReplyQueueItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is MailReplyQueueItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as MailReplyQueueItem).id === "string" &&
      typeof (e as MailReplyQueueItem).messageKey === "string" &&
      typeof (e as MailReplyQueueItem).draft === "string"
  );
}

export function countPendingMailReplyDrafts(data: unknown): number {
  return parseMailReplyQueue(data).filter((q) => q.status === "draft").length;
}

/**
 * Auto-draft email replies into mail-reply-queue (never auto-sends).
 * Uses recent unread Gmail/Outlook messages for the tenant — draft-before-send.
 */
export async function runMailReplyAuto(deps: {
  supabaseAdmin: SupabaseAdminLike;
  tokenStore: TokenStoreLike & { set: (id: string, value: Record<string, unknown>) => Promise<unknown> };
  businessProfileId: string;
  profile: BusinessProfileRow;
  openaiKey?: string | null;
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ drafted: number; notified: boolean; scanned: number }> {
  const { supabaseAdmin, tokenStore, businessProfileId, profile, openaiKey, notifyEmail, appUrl } = deps;

  const { data: accountRows } = await supabaseAdmin
    .from("connected_accounts")
    .select("id,platform,disconnected_at")
    .eq("business_profile_id", businessProfileId)
    .in("platform", ["gmail", "outlook"])
    .is("disconnected_at", null);
  const accounts = Array.isArray(accountRows) ? accountRows : [];
  if (accounts.length === 0) return { drafted: 0, notified: false, scanned: 0 };

  const queueDoc = await loadProfileDocument(supabaseAdmin, businessProfileId, MAIL_REPLY_QUEUE_DOC_KEY);
  const queue = parseMailReplyQueue(queueDoc?.data);
  const queuedKeys = new Set(queue.filter((q) => q.status === "draft" || q.status === "sent").map((q) => q.messageKey));

  const newItems: MailReplyQueueItem[] = [];
  const businessName = String(profile.name || "Our business");
  let scanned = 0;

  for (const row of accounts) {
    if (newItems.length >= 5) break;
    const accountId = String(row?.id || "");
    const platform = String(row?.platform || "");
    if (!accountId || (platform !== "gmail" && platform !== "outlook")) continue;

    const stored = await tokenStore.get(accountId);
    if (!stored?.accessToken) continue;

    try {
      const data =
        platform === "gmail"
          ? await fetchGmailAccountData({
              accessToken: String(stored.accessToken || ""),
              refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
              accountId,
              tokenStore,
              stored,
              googleClientId: process.env.GOOGLE_CLIENT_ID,
              googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
              labelId: "INBOX",
            })
          : await fetchOutlookMailData({
              accessToken: String(stored.accessToken || ""),
              refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
              accountId,
              tokenStore,
              stored,
              microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
              microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
            });

      if (data && "error" in data && data.error) continue;
      const list = Array.isArray((data as { messages?: unknown[] })?.messages)
        ? (data as { messages: Array<Record<string, unknown>> }).messages
        : [];

      for (const msg of list) {
        if (newItems.length >= 5) break;
        const mid = String(msg.id || "").trim();
        if (!mid) continue;
        scanned += 1;
        if (!msg.isUnread) continue;
        const messageKey = `${platform}:${accountId}:${mid}`;
        if (queuedKeys.has(messageKey)) continue;

        const from = (msg.from as { name?: string; email?: string }) || {};
        const authorName = String(from.name || from.email || "there");
        const text = String(msg.body || msg.snippet || "").trim();
        if (!text) continue;

        const { draft } = await generateReplyDraft(
          {
            kind: "email",
            text: text.slice(0, 4000),
            authorName,
            businessName,
          },
          openaiKey
        );

        newItems.push({
          id: crypto.randomUUID(),
          messageKey,
          accountId,
          platform,
          providerMessageId: mid,
          subject: String(msg.subject || "(utan ämne)"),
          fromName: authorName,
          fromEmail: String(from.email || ""),
          snippet: String(msg.snippet || text).slice(0, 280),
          draft,
          status: "draft",
          createdAt: new Date().toISOString(),
        });
        queuedKeys.add(messageKey);
      }
    } catch (err) {
      console.warn(
        `[mail-reply-auto] account=${accountId} failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  if (newItems.length === 0) return { drafted: 0, notified: false, scanned };

  const nextQueue = [...newItems, ...queue].slice(0, 40);
  await saveProfileDocument(supabaseAdmin, businessProfileId, MAIL_REPLY_QUEUE_DOC_KEY, nextQueue);

  let notified = false;
  if (notifyEmail) {
    const messagesUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/messages` : "/messages";
    const result = await sendEmail({
      to: notifyEmail,
      subject: `${businessName}: ${newItems.length} mail-utkast redo`,
      html:
        `<p>${newItems.length} automatiska mail-svar väntar på godkännande.</p>` +
        `<p><a href="${messagesUrl}">Öppna Meddelanden</a></p>`,
      text: `${newItems.length} mail-utkast redo. Öppna Meddelanden: ${messagesUrl}`,
    });
    notified = result.ok;
  }

  return { drafted: newItems.length, notified, scanned };
}
