/**
 * Reel composition helpers (Cloudinary-backed).
 *
 * Clips are uploaded straight from the browser to Cloudinary (signed upload),
 * so large iPhone/iCloud videos never pass through our API. The server only
 * signs upload params and builds the final concatenation URL: Cloudinary's
 * `fl_splice` chains the trimmed clips into one 9:16 mp4 suitable for
 * Reels/TikTok, hosted permanently so the publish flow can reference it.
 */

import crypto from "crypto";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
/** Allowed reel targets in seconds (UI offers 30/60). */
export const REEL_TARGETS = [30, 60] as const;
export const REEL_MAX_CLIPS = 10;

export type ReelClipInput = {
  publicId: string;
  /** Source clip duration in seconds, as reported by Cloudinary at upload. */
  duration: number;
  /** Optional trim start inside the source clip. */
  startOffset?: number;
};

/** Cloudinary public ids: folders, word chars, dashes and dots. */
const PUBLIC_ID_PATTERN = /^[\w\-./]+$/;

export function isValidReelPublicId(publicId: string): boolean {
  return (
    publicId.length > 0 &&
    publicId.length <= 255 &&
    PUBLIC_ID_PATTERN.test(publicId) &&
    !publicId.includes("..")
  );
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Distribute the target duration across clips, capped by each clip's usable
 * length (waterfill): short clips keep their full length and the freed time
 * is redistributed to longer clips. If the clips together are shorter than
 * the target, the reel simply becomes as long as the material allows.
 */
export function planReelSegments(
  clips: Array<{ duration: number; startOffset?: number }>,
  targetSeconds: number
): number[] {
  const usable = clips.map((clip) => {
    const offset = Math.max(0, clip.startOffset ?? 0);
    return Math.max(0, (Number.isFinite(clip.duration) ? clip.duration : 0) - offset);
  });
  const total = usable.reduce((a, b) => a + b, 0);
  if (total <= targetSeconds) {
    return usable.map(roundTenth);
  }

  const seconds = new Array<number>(clips.length).fill(0);
  const order = usable
    .map((duration, index) => ({ duration, index }))
    .sort((a, b) => a.duration - b.duration);
  let remainingTarget = targetSeconds;
  let remainingClips = clips.length;
  for (const { duration, index } of order) {
    const share = remainingTarget / remainingClips;
    const take = Math.min(duration, share);
    seconds[index] = take;
    remainingTarget -= take;
    remainingClips -= 1;
  }
  return seconds.map(roundTenth);
}

function formatSeconds(value: number): string {
  // Cloudinary accepts decimals; keep one decimal to match the planner.
  return String(roundTenth(value));
}

/** Overlay layer ids use ':' instead of '/' for folder separators. */
function overlayId(publicId: string): string {
  return publicId.replace(/\//g, ":");
}

export type ReelSegment = { publicId: string; seconds: number; startOffset: number };

export function buildReelUrl(options: {
  cloudName: string;
  segments: ReelSegment[];
}): { url: string; posterUrl: string } {
  const { cloudName, segments } = options;
  if (segments.length === 0) {
    throw new Error("reel_requires_clips");
  }
  const fill = `c_fill,w_${REEL_WIDTH},h_${REEL_HEIGHT}`;
  const trim = (segment: ReelSegment) => {
    const parts: string[] = [];
    if (segment.startOffset > 0) parts.push(`so_${formatSeconds(segment.startOffset)}`);
    parts.push(`du_${formatSeconds(segment.seconds)}`);
    return parts.join(",");
  };

  const [base, ...rest] = segments;
  const transformations: string[] = [`${trim(base)},${fill}`];
  for (const segment of rest) {
    transformations.push(`fl_splice,l_video:${overlayId(segment.publicId)}`);
    transformations.push(`${trim(segment)},${fill}`);
    transformations.push("fl_layer_apply");
  }

  const prefix = `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/video/upload`;
  return {
    url: `${prefix}/${transformations.join("/")}/${base.publicId}.mp4`,
    posterUrl: `${prefix}/so_0,${fill}/${base.publicId}.jpg`,
  };
}

/**
 * Cloudinary signed-upload signature: SHA-1 over the alphabetically sorted
 * `key=value` pairs joined with `&`, with the API secret appended.
 */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

/** Reads CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET or a CLOUDINARY_URL. */
export function readCloudinaryConfig(env: Record<string, string | undefined>): CloudinaryConfig | null {
  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(env.CLOUDINARY_API_SECRET || "").trim();
  if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };

  const url = String(env.CLOUDINARY_URL || "").trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "cloudinary:" && parsed.username && parsed.password && parsed.hostname) {
        return {
          cloudName: parsed.hostname,
          apiKey: decodeURIComponent(parsed.username),
          apiSecret: decodeURIComponent(parsed.password),
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}
