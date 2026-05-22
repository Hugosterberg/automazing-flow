/**
 * Non-gateway Zernio utilities: API key + headers readers, platform slug
 * mapping, account payload normalization, OAuth state generator, and the
 * Zernio profile-id bootstrap.
 *
 * These live outside `zernioModule.ts` because they're building blocks used
 * by the gateway itself (and by a few routes that still hand-wire auth).
 */

import crypto from "crypto";
import type { ZernioModule } from "../providers/zernioModule.ts";

export const ERR_NO_ZERNIO_KEY = "Set ZERNIO_API_KEY in .env.local";

/** Also reads LATE_API_KEY if ZERNIO_API_KEY is unset (old env files). */
export function getZernioApiKey(): string {
  return (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").trim();
}

export function getZernioProfileIdEnv(): string {
  return (process.env.ZERNIO_PROFILE_ID || process.env.LATE_PROFILE_ID || "").trim();
}

export function zernioAuthHeaders(): Record<string, string> | null {
  const key = getZernioApiKey();
  return key ? { Authorization: `Bearer ${key}` } : null;
}

export function mapZernioPlatform(raw: string | undefined): string | null {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (s.includes("whatsapp")) return "whatsapp";
  if (
    (s.includes("google") && s.includes("business")) ||
    s === "google-business" ||
    s === "googlebusiness" ||
    s.includes("gbp")
  ) {
    return "google_business";
  }
  if ((s.includes("google") && s.includes("review")) || s === "google-reviews" || s === "googlereviews") {
    return "google_reviews";
  }
  if (s.includes("tripadvisor") || s.includes("trip-advisor")) return "tripadvisor";
  if (s.includes("google-calendar") || s.includes("google calendar") || s.includes("gcal")) {
    return "google_calendar";
  }
  if (s.includes("outlook-calendar") || s.includes("outlook calendar") || s.includes("microsoft-calendar")) {
    return "outlook_calendar";
  }
  if (s.includes("facebook") || s === "fb" || s.includes("pages")) return "facebook";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("twitter") || s === "x") return "x";
  if (s.includes("youtube")) return "youtube";
  return null;
}

export function normalizeZernioAccountsPayload(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const data = b.data as Record<string, unknown> | undefined;
  const list =
    data?.accounts ??
    b.accounts ??
    b.data ??
    (Array.isArray(body) ? body : null);
  return Array.isArray(list) ? list : [];
}

export function extractProfileId(data: unknown): string | null {
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const profile = d.profile as Record<string, unknown> | undefined;
  const id = profile?._id ?? profile?.id ?? d._id ?? d.id;
  if (id) return String(id);
  const list = (d.profiles ?? d.data ?? (Array.isArray(data) ? data : null)) as unknown[] | null;
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] as Record<string, unknown>;
    return String(first._id ?? first.id ?? first.profileId ?? "");
  }
  return null;
}

export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Returns the Zernio profile ID to use as `profileId` when linking accounts:
 *   1. ZERNIO_PROFILE_ID / LATE_PROFILE_ID env override
 *   2. First existing Zernio profile returned by the API
 *   3. Creates a new "Automazing Flow" profile
 *   4. Returns null if the Zernio API key is missing or the request fails.
 */
export function createGetOrCreateZernioProfileId(zernio: ZernioModule) {
  return async function getOrCreateZernioProfileId(): Promise<string | null> {
    const existing = getZernioProfileIdEnv();
    if (existing) return existing;
    if (!getZernioApiKey()) return null;

    const listResult = await zernio.listProfiles();
    const idFromList = listResult.ok ? extractProfileId(listResult.data) : null;
    if (idFromList) {
      console.log("[Zernio] Using existing profile:", idFromList.slice(0, 8) + "...");
      return idFromList;
    }
    if (!listResult.ok) {
      console.warn(
        "[Zernio] GET /profiles:",
        listResult.status,
        JSON.stringify(listResult.details || {}).slice(0, 200)
      );
    }

    const createResult = await zernio.createProfile({ name: "Automazing Flow" });
    const idFromCreate = createResult.ok ? extractProfileId(createResult.data) : null;
    if (idFromCreate) return idFromCreate;

    console.warn(
      "[Zernio] POST /profiles failed:",
      createResult.status,
      JSON.stringify(createResult.details || {}).slice(0, 300)
    );
    return null;
  };
}
