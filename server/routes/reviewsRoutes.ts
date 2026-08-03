/**
 * Review replies (Zernio-first).
 *
 * Posting a public reply to a Google Business / Tripadvisor review goes through
 * the Zernio inbox API (`POST /inbox/review-reply`). The reviewing account must
 * be connected via Zernio (it carries a `zernioAccountId`). Ownership is checked
 * against the stored token entry before any write.
 *
 * AI-drafted reply text lives in aiRoutes (`POST /api/reviews/reply-draft`) so
 * all OpenAI usage + per-tenant key resolution stays in one place.
 */

import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import { judgemeCredentialsFromStored, sendJudgemeReviewRequest } from "../providers/judgeme.ts";
import { logActivity } from "../lib/activityLog.ts";
import { accountInBusinessProfile, readRequestBodyBusinessProfileId } from "../lib/profileScope.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  ownerUserId?: string;
  profileId?: string | null;
  zernioAccountId?: string;
  lateAccountId?: string;
};

interface ReviewsRoutesDeps {
  getSessionUserId: (req: unknown) => string | null;
  tokenStore: {
    get: (accountId: string) => Promise<StoredAccount | null | undefined>;
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
  };
  getStoredAccountAccess: (
    stored: StoredAccount | null | undefined,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
  zernio: ZernioModule;
  supabaseAdmin?: unknown;
}

export function registerReviewsRoutes(app, deps: ReviewsRoutesDeps) {
  const { getSessionUserId, tokenStore, getStoredAccountAccess, zernio, supabaseAdmin } = deps;

  app.post("/api/reviews/reply", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const body = (req.body ?? {}) as { accountId?: string; reviewId?: string; message?: string; business_profile_id?: string };
    const accountId = String(body.accountId || "").trim();
    const reviewId = String(body.reviewId || "").trim();
    const message = String(body.message || "").trim();
    const businessProfileId = readRequestBodyBusinessProfileId(req);

    if (!accountId || !reviewId || !message) {
      return res.status(400).json({ error: "accountId, reviewId and message are required" });
    }
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    const stored = await tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not connected" });
    }
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      return res.status(404).json({ error: "Account not connected" });
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) {
      return res.status(404).json({ error: "Account not connected for this business profile" });
    }

    if (String(stored.platform || "") === "judgeme") {
      // The public Judge.me API has no reply endpoint — replies are posted in
      // the Judge.me admin. Surface that instead of the generic Zernio hint.
      return res.status(400).json({
        error: "review_reply_not_supported_judgeme",
        message:
          "Judge.me:s API stöder inte att publicera svar. Kopiera svaret och lägg in det i Judge.me admin (Reviews → Manage reviews).",
      });
    }

    const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();
    if (!zernioAccountId) {
      return res.status(400).json({
        error: "review_reply_requires_zernio",
        message: "Replying to reviews currently requires the account to be connected through Zernio.",
      });
    }

    const result = await zernio.replyReview({ reviewId, message, accountId: zernioAccountId });
    if (!result.ok) {
      const failure = describeZernioFailure(result);
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: failure.code,
        message: failure.message,
      });
    }

    // Record the reply so it shows in the notifications bell / Activity feed.
    if (supabaseAdmin) {
      void logActivity(supabaseAdmin as Parameters<typeof logActivity>[0], {
        businessProfileId,
        actorUserId: userId,
        module: "reviews",
        eventType: "review.replied",
        subjectType: "review",
        subjectId: reviewId,
        severity: "success",
        summary: `Replied to a review on ${String(stored.platform || "a review site")}`,
      });
    }

    return res.json({ ok: true, data: result.data });
  });

  /**
   * Trigger Judge.me's branded review-request email for a customer/order.
   * Judge.me owns the template and the review-form link; we just point it at
   * the right order + email.
   */
  app.post("/api/reviews/judgeme/send-request", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const body = (req.body ?? {}) as {
      accountId?: string;
      email?: string;
      name?: string;
      orderId?: string;
      business_profile_id?: string;
    };
    const accountId = String(body.accountId || "").trim();
    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    const orderId = String(body.orderId || "").trim();
    const businessProfileId = readRequestBodyBusinessProfileId(req);

    if (!accountId || !email || !orderId) {
      return res.status(400).json({ error: "accountId, email and orderId are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "email is not a valid address" });
    }
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    const stored = await tokenStore.get(accountId);
    if (!stored || String(stored.platform || "") !== "judgeme") {
      return res.status(404).json({ error: "Judge.me account not connected" });
    }
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      return res.status(404).json({ error: "Judge.me account not connected" });
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) {
      return res.status(404).json({ error: "Account not connected for this business profile" });
    }

    const creds = judgemeCredentialsFromStored(stored);
    if (!creds) {
      return res.status(400).json({ error: "Judge.me credentials missing. Reconnect the account." });
    }

    const result = await sendJudgemeReviewRequest(creds, { orderId, email, name: name || undefined });
    if (!result.ok) {
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: result.error,
      });
    }

    if (supabaseAdmin) {
      void logActivity(supabaseAdmin as Parameters<typeof logActivity>[0], {
        businessProfileId,
        actorUserId: userId,
        module: "reviews",
        eventType: "review.request_sent",
        subjectType: "order",
        subjectId: orderId,
        severity: "success",
        summary: `Sent a Judge.me review request to ${email}`,
      });
    }

    return res.json({ ok: true });
  });
}
