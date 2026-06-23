/**
 * Content publishing pipeline (Zernio-first).
 *
 * Schedules or immediately publishes a post to one or more connected social
 * accounts through Zernio (`POST /posts`). Each target is a local account id
 * that must carry a `zernioAccountId`; ownership is checked before publishing.
 */

import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import { accountInBusinessProfile, readRequestBodyBusinessProfileId } from "../lib/profileScope.ts";

type StoredAccount = Record<string, unknown> & {
  platform?: string;
  ownerUserId?: string;
  username?: string;
  zernioAccountId?: string;
  lateAccountId?: string;
};

interface ContentRoutesDeps {
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
}

/** Map our app platform to the Zernio post platform slug. */
const ZERNIO_POST_PLATFORM: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  youtube: "youtube",
  x: "twitter",
};

export function registerContentRoutes(app, deps: ContentRoutesDeps) {
  const { getSessionUserId, tokenStore, getStoredAccountAccess, zernio } = deps;

  app.post("/api/content/publish", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const body = (req.body ?? {}) as {
      accountIds?: string[];
      content?: string;
      scheduledFor?: string;
      publishNow?: boolean;
      timezone?: string;
      mediaUrls?: string[];
      business_profile_id?: string;
    };
    const accountIds = Array.isArray(body.accountIds)
      ? body.accountIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const content = String(body.content || "").trim();
    const scheduledFor = String(body.scheduledFor || "").trim();
    const publishNow = Boolean(body.publishNow);
    const businessProfileId = readRequestBodyBusinessProfileId(req);

    if (accountIds.length === 0) {
      return res.status(400).json({ error: "Select at least one account" });
    }
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }
    if (!publishNow && !scheduledFor) {
      return res.status(400).json({ error: "Provide scheduledFor or set publishNow" });
    }
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    const platforms: Array<{ platform: string; accountId: string }> = [];
    const skipped: Array<{ accountId: string; reason: string }> = [];

    for (const accountId of accountIds) {
      const stored = await tokenStore.get(accountId);
      if (!stored) {
        skipped.push({ accountId, reason: "not_connected" });
        continue;
      }
      const access = getStoredAccountAccess(stored, userId);
      if (!access.allowed) {
        skipped.push({ accountId, reason: "forbidden" });
        continue;
      }
      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }
      if (!accountInBusinessProfile(stored, businessProfileId)) {
        skipped.push({ accountId, reason: "wrong_business_profile" });
        continue;
      }
      const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();
      const slug = ZERNIO_POST_PLATFORM[String(stored.platform || "")];
      if (!zernioAccountId || !slug) {
        skipped.push({ accountId, reason: "not_publishable_via_zernio" });
        continue;
      }
      platforms.push({ platform: slug, accountId: zernioAccountId });
    }

    if (platforms.length === 0) {
      return res.status(400).json({
        error: "no_publishable_accounts",
        message: "None of the selected accounts can publish via Zernio (need a Zernio-connected social account).",
        skipped,
      });
    }

    const mediaItems = Array.isArray(body.mediaUrls)
      ? body.mediaUrls
          .map((url) => String(url || "").trim())
          .filter(Boolean)
          .map((url) => ({ type: /\.(mp4|mov|webm)$/i.test(url) ? "video" : "image", url }))
      : undefined;

    const result = await zernio.createPost({
      content,
      platforms,
      publishNow,
      scheduledFor: publishNow ? undefined : scheduledFor,
      timezone: body.timezone ? String(body.timezone) : undefined,
      mediaItems,
    });

    if (!result.ok) {
      const failure = describeZernioFailure(result);
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: failure.code,
        message: failure.message,
        skipped,
      });
    }

    return res.json({ ok: true, published: platforms.length, skipped, data: result.data });
  });
}
