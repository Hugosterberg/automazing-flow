/**
 * Content publishing pipeline (Zernio-first).
 *
 * Schedules or immediately publishes a post to one or more connected social
 * accounts through Zernio (`POST /posts`). Each target is a local account id
 * that must carry a `zernioAccountId`; ownership is checked before publishing.
 */

import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import { exportCanvaDesignImage, refreshCanvaAccessToken } from "../providers/canva.ts";
import { publicMediaUrl, readGeneratedMedia, storeGeneratedMedia } from "../lib/generatedMediaStore.ts";
import { accountInBusinessProfile, readRequestBodyBusinessProfileId } from "../lib/profileScope.ts";
import { ZERNIO_POST_PLATFORM } from "../lib/scheduledPostsPublisher.ts";

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
    entries: () => Promise<Array<[string, StoredAccount]>>;
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


const EPHEMERAL_MEDIA_SCHEDULE_LIMIT_MS = 20 * 60 * 60 * 1000;

function isEphemeralGeneratedMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("/api/content/media/") || lower.includes("canva");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function registerContentRoutes(app, deps: ContentRoutesDeps) {
  const { getSessionUserId, tokenStore, getStoredAccountAccess, zernio, secretResolver } = deps;

  function canvaTokenFreshEnough(stored: StoredAccount): boolean {
    const raw = String(stored.expiresAt || "").trim();
    if (!raw) return true;
    const expiresAt = new Date(raw).getTime();
    return Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000;
  }

  async function refreshStoredCanvaToken(accountId: string, stored: StoredAccount): Promise<string | null> {
    const clientId = String(process.env.CANVA_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.CANVA_CLIENT_SECRET || "").trim();
    const refreshToken = String(stored.refreshToken || "").trim();
    if (!clientId || !clientSecret || !refreshToken) return null;

    const refreshed = await refreshCanvaAccessToken({ clientId, clientSecret, refreshToken });
    if (!refreshed.ok) return null;
    const expiresAt = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
      : stored.expiresAt;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      expiresAt,
      ...(refreshed.scope ? { scope: refreshed.scope } : {}),
    });
    return refreshed.accessToken;
  }

  async function resolveCanvaOAuthToken(options: {
    userId: string;
    businessProfileId: string | null;
  }): Promise<{
    token: string | null;
    accountId?: string;
    stored?: StoredAccount;
    source: "oauth" | "secret" | "none";
  }> {
    const entries = await tokenStore.entries();
    for (const [accountId, stored] of entries) {
      if (String(stored.platform || "") !== "canva") continue;
      const access = getStoredAccountAccess(stored, options.userId);
      if (!access.allowed) continue;
      if (access.migrate) {
        await tokenStore.set(accountId, { ...stored, ownerUserId: options.userId });
      }
      if (!accountInBusinessProfile(stored, options.businessProfileId)) continue;

      if (canvaTokenFreshEnough(stored) && stored.accessToken) {
        return { token: String(stored.accessToken), accountId, stored, source: "oauth" };
      }
      const refreshed = await refreshStoredCanvaToken(accountId, stored);
      if (refreshed) return { token: refreshed, accountId, stored, source: "oauth" };
    }

    const secretToken = String(
      (secretResolver ? await secretResolver.resolve(options.businessProfileId, "CANVA_ACCESS_TOKEN") : process.env.CANVA_ACCESS_TOKEN) ||
        process.env.CANVA_ACCESS_TOKEN ||
        ""
    ).trim();
    return secretToken ? { token: secretToken, source: "secret" } : { token: null, source: "none" };
  }

  app.get("/api/content/media/:id", (req, res) => {
    const id = String(req.params?.id || "");
    const item = readGeneratedMedia(id);
    if (!item) return res.status(404).json({ error: "media_not_found" });
    res.setHeader("Content-Type", item.contentType);
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    return res.send(item.buffer);
  });

  app.post("/api/content/media/upload", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessProfileId = readRequestBodyBusinessProfileId(req);
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    const body = (req.body ?? {}) as {
      dataBase64?: string;
      contentType?: string;
      filename?: string;
    };
    const raw = String(body.dataBase64 || "").trim();
    if (!raw) {
      return res.status(400).json({ error: "dataBase64 is required" });
    }

    const contentType = String(body.contentType || "image/png").trim();
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({
        error: "invalid_content_type",
        message: "Only image uploads are supported.",
      });
    }

    const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return res.status(400).json({ error: "invalid_base64" });
    }
    const maxUploadBytes = 12 * 1024 * 1024;
    if (!buffer.length || buffer.length > maxUploadBytes) {
      return res.status(413).json({
        error: "upload_too_large",
        message: "Image must be smaller than 12 MB.",
      });
    }

    const id = storeGeneratedMedia(buffer, contentType);
    const url = publicMediaUrl(req, id);
    return res.json({
      ok: true,
      url,
      filename: String(body.filename || id),
      contentType,
      source: "upload",
    });
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

    const tokenResolution = await resolveCanvaOAuthToken({ userId, businessProfileId });
    if (!tokenResolution.token) {
      return res.status(400).json({
        error: "canva_not_configured",
        message:
          "Connect Canva from Connections, or add CANVA_ACCESS_TOKEN under Preferences -> API keys or .env.local. Canva Connect needs design:content:read.",
      });
    }

    let result = await exportCanvaDesignImage({
      accessToken: tokenResolution.token,
      designId,
      format: body.format === "jpg" ? "jpg" : "png",
      width: Number.isFinite(Number(body.width)) ? Number(body.width) : undefined,
      height: Number.isFinite(Number(body.height)) ? Number(body.height) : undefined,
    });
    if (
      result.ok === false &&
      result.status === 401 &&
      tokenResolution.source === "oauth" &&
      tokenResolution.accountId &&
      tokenResolution.stored
    ) {
      const refreshed = await refreshStoredCanvaToken(tokenResolution.accountId, tokenResolution.stored);
      if (refreshed) {
        result = await exportCanvaDesignImage({
          accessToken: refreshed,
          designId,
          format: body.format === "jpg" ? "jpg" : "png",
          width: Number.isFinite(Number(body.width)) ? Number(body.width) : undefined,
          height: Number.isFinite(Number(body.height)) ? Number(body.height) : undefined,
        });
      }
    }
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
    const scheduledAtMs = scheduledFor ? Date.parse(scheduledFor) : NaN;
    if (!publishNow) {
      if (!Number.isFinite(scheduledAtMs)) {
        return res.status(400).json({ error: "scheduledFor must be a valid date" });
      }
      if (scheduledAtMs < Date.now() - 60_000) {
        return res.status(400).json({ error: "scheduledFor must be in the future" });
      }
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

    const mediaUrls = Array.isArray(body.mediaUrls)
      ? body.mediaUrls.map((url) => String(url || "").trim()).filter(Boolean).slice(0, 10)
      : [];
    if (mediaUrls.some((url) => !isHttpUrl(url))) {
      return res.status(400).json({
        error: "invalid_media_url",
        message: "Every media URL must be a valid http(s) URL.",
      });
    }
    if (
      !publishNow &&
      mediaUrls.some(isEphemeralGeneratedMediaUrl) &&
      scheduledAtMs - Date.now() > EPHEMERAL_MEDIA_SCHEDULE_LIMIT_MS
    ) {
      return res.status(400).json({
        error: "media_url_expires_before_schedule",
        message:
          "Generated AI/Canva media URLs are temporary. Publish now or schedule within 20 hours, then regenerate/export fresh media for later posts.",
      });
    }
    const mediaItems =
      mediaUrls.length > 0
        ? mediaUrls.map((url) => ({ type: /\.(mp4|mov|webm)(\?|#|$)/i.test(url) ? "video" : "image", url }))
        : undefined;

    const result = await zernio.createPost({
      content,
      platforms,
      publishNow,
      scheduledFor: publishNow ? undefined : new Date(scheduledAtMs).toISOString(),
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
