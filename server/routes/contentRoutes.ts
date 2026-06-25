/**
 * Content publishing pipeline (Zernio-first).
 *
 * Schedules or immediately publishes a post to one or more connected social
 * accounts through Zernio (`POST /posts`). Each target is a local account id
 * that must carry a `zernioAccountId`; ownership is checked before publishing.
 */

import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import { exportCanvaDesignImage } from "../providers/canva.ts";
import { publicMediaUrl, readGeneratedMedia, storeGeneratedMedia } from "../lib/generatedMediaStore.ts";
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
  secretResolver?: {
    resolve: (businessProfileId: string | null | undefined, key: string) => Promise<string | null>;
  };
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
  const { getSessionUserId, tokenStore, getStoredAccountAccess, zernio, secretResolver } = deps;

  app.get("/api/content/media/:id", (req, res) => {
    const id = String(req.params?.id || "");
    const item = readGeneratedMedia(id);
    if (!item) return res.status(404).json({ error: "media_not_found" });
    res.setHeader("Content-Type", item.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(item.buffer);
  });

  app.post("/api/content/canva/export", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const body = (req.body ?? {}) as {
      designId?: string;
      format?: "png" | "jpg";
      width?: number;
      height?: number;
      business_profile_id?: string;
    };
    const businessProfileId = readRequestBodyBusinessProfileId(req);
    const designId = String(body.designId || "").trim();
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }
    if (!designId) {
      return res.status(400).json({ error: "designId is required" });
    }

    const accessToken = String(
      (secretResolver ? await secretResolver.resolve(businessProfileId, "CANVA_ACCESS_TOKEN") : process.env.CANVA_ACCESS_TOKEN) ||
        process.env.CANVA_ACCESS_TOKEN ||
        ""
    ).trim();
    if (!accessToken) {
      return res.status(400).json({
        error: "canva_not_configured",
        message:
          "Add CANVA_ACCESS_TOKEN under Preferences -> API keys or .env.local. Canva Connect uses OAuth access tokens with design:content:read.",
      });
    }

    const result = await exportCanvaDesignImage({
      accessToken,
      designId,
      format: body.format === "jpg" ? "jpg" : "png",
      width: Number.isFinite(Number(body.width)) ? Number(body.width) : undefined,
      height: Number.isFinite(Number(body.height)) ? Number(body.height) : undefined,
    });
    if (result.ok === false) {
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: "canva_export_failed",
        message: result.message,
        details: result.details,
      });
    }

    let url = result.url;
    try {
      const downloaded = await fetch(result.url, { signal: AbortSignal.timeout(20_000) });
      if (downloaded.ok) {
        const contentType = downloaded.headers.get("content-type") || (body.format === "jpg" ? "image/jpeg" : "image/png");
        const buffer = Buffer.from(await downloaded.arrayBuffer());
        const id = storeGeneratedMedia(buffer, contentType);
        url = publicMediaUrl(req, id);
      }
    } catch {
      // The Canva URL is still usable for immediate publish; it expires after 24h.
    }

    return res.json({ ok: true, url, canvaUrl: result.url, jobId: result.jobId, urls: result.urls, source: "canva" });
  });

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
