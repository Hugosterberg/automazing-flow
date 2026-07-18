/**
 * Reel builder (clip stitching) routes.
 *
 * POST /api/content/reel/upload-params  — signs a direct browser→Cloudinary
 *   video upload so large iPhone/iCloud clips never pass through our API
 *   (Vercel functions cap request bodies at ~4.5 MB).
 * POST /api/content/reel/compose        — plans per-clip durations for a
 *   30/60s reel and returns the Cloudinary splice URL (9:16 1080x1920 mp4).
 */

import { readRequestBodyBusinessProfileId } from "../lib/profileScope.ts";
import {
  REEL_MAX_CLIPS,
  REEL_TARGETS,
  buildReelUrl,
  isValidReelPublicId,
  planReelSegments,
  readCloudinaryConfig,
  signCloudinaryParams,
  type ReelClipInput,
} from "../lib/reelCompose.ts";

interface ReelRoutesDeps {
  getSessionUserId: (req: unknown) => string | null;
}

export function registerReelRoutes(app, deps: ReelRoutesDeps) {
  const { getSessionUserId } = deps;

  app.post("/api/content/reel/upload-params", (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessProfileId = readRequestBodyBusinessProfileId(req);
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    const config = readCloudinaryConfig(process.env);
    if (!config) {
      return res.status(501).json({
        error: "cloudinary_not_configured",
        message:
          "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) to enable the reel builder.",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Scope uploads per business profile so assets stay separable.
    const folder = `automazing/reels/${businessProfileId}`.replace(/[^\w\-/]/g, "");
    const signature = signCloudinaryParams({ folder, timestamp }, config.apiSecret);
    return res.json({
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      timestamp,
      folder,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/video/upload`,
    });
  });

  app.post("/api/content/reel/compose", (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessProfileId = readRequestBodyBusinessProfileId(req);
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }

    const config = readCloudinaryConfig(process.env);
    if (!config) {
      return res.status(501).json({ error: "cloudinary_not_configured" });
    }

    const body = (req.body ?? {}) as { clips?: unknown; target?: unknown };
    const target = Number(body.target);
    if (!REEL_TARGETS.includes(target as (typeof REEL_TARGETS)[number])) {
      return res.status(400).json({ error: "invalid_target", message: "target must be 30 or 60" });
    }

    const rawClips = Array.isArray(body.clips) ? body.clips : [];
    if (rawClips.length === 0 || rawClips.length > REEL_MAX_CLIPS) {
      return res.status(400).json({
        error: "invalid_clips",
        message: `Provide 1-${REEL_MAX_CLIPS} clips.`,
      });
    }

    const clips: ReelClipInput[] = [];
    for (const raw of rawClips) {
      const clip = (raw ?? {}) as Record<string, unknown>;
      const publicId = String(clip.publicId || "").trim();
      const duration = Number(clip.duration);
      const startOffset = Math.max(0, Number(clip.startOffset) || 0);
      if (!isValidReelPublicId(publicId)) {
        return res.status(400).json({ error: "invalid_public_id" });
      }
      if (!Number.isFinite(duration) || duration <= 0 || duration > 60 * 30) {
        return res.status(400).json({ error: "invalid_duration" });
      }
      clips.push({ publicId, duration, startOffset });
    }

    const seconds = planReelSegments(clips, target);
    const segments = clips
      .map((clip, index) => ({
        publicId: clip.publicId,
        seconds: seconds[index] ?? 0,
        startOffset: clip.startOffset ?? 0,
      }))
      .filter((segment) => segment.seconds > 0);
    if (segments.length === 0) {
      return res.status(400).json({ error: "invalid_clips", message: "Clips have no usable duration." });
    }

    const { url, posterUrl } = buildReelUrl({ cloudName: config.cloudName, segments });
    const totalSeconds = Math.round(segments.reduce((sum, s) => sum + s.seconds, 0) * 10) / 10;
    return res.json({ ok: true, url, posterUrl, totalSeconds, segments });
  });
}
