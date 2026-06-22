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
import { logActivity } from "../lib/activityLog.ts";
import { accountInBusinessProfile } from "../lib/profileScope.ts";

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
    const businessProfileId = String(body.business_profile_id || "").trim() || null;

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
}
