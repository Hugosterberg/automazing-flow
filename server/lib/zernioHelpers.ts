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
  if (s.includes("google") && s.includes("ads")) return "google_ads";
  if (s.includes("meta") && s.includes("business")) return "meta_business";
  if (s.includes("meta") && (s.includes("ads") || s.includes("ad-account"))) return "meta_business";
  if (s.includes("facebook") && s.includes("business")) return "meta_business";
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

/**
 * Minimal Supabase surface this helper needs. Kept structural so tests can pass
 * a plain stub.
 */
export interface ZernioProfileSupabase {
  from(table: string): {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Per-tenant Zernio profile resolver.
 *
 * One global ZERNIO_API_KEY (the platform owner's) covers all tenants; each
 * business_profile gets its own Zernio "profile" (workspace) so connected
 * channels and inbox stay isolated. Resolution for a given businessProfileId:
 *   1. `business_profiles.zernio_profile_id` if already set
 *   2. otherwise create a Zernio profile named after the business and persist it
 *
 * When `businessProfileId` is falsy, or Supabase isn't configured, this falls
 * back to the shared (global) resolver so existing behaviour is preserved.
 */
export function createGetOrCreateZernioProfileIdForTenant(deps: {
  zernio: ZernioModule;
  supabaseAdmin: ZernioProfileSupabase | null;
  fallbackResolver: () => Promise<string | null>;
}) {
  const { zernio, supabaseAdmin, fallbackResolver } = deps;

  return async function getOrCreateZernioProfileIdForTenant(
    businessProfileId?: string | null
  ): Promise<string | null> {
    const bp = String(businessProfileId || "").trim();
    if (!bp || !supabaseAdmin || bp.startsWith("local_")) {
      return fallbackResolver();
    }
    if (!getZernioApiKey()) return null;

    const { data, error } = await supabaseAdmin
      .from("business_profiles")
      .select("name, zernio_profile_id")
      .eq("id", bp)
      .maybeSingle();

    if (error) {
      console.warn("[Zernio] business_profiles lookup failed:", error.message);
      return fallbackResolver();
    }

    const row = (data || {}) as { name?: string; zernio_profile_id?: string | null };
    const existing = String(row.zernio_profile_id || "").trim();
    if (existing) return existing;

    const name = String(row.name || "").trim() || `Automazing ${bp.slice(0, 8)}`;
    const createResult = await zernio.createProfile({ name });
    const created = createResult.ok ? extractProfileId(createResult.data) : null;
    if (!created) {
      console.warn(
        "[Zernio] POST /profiles (tenant) failed:",
        createResult.status,
        JSON.stringify(createResult.details || {}).slice(0, 300)
      );
      return fallbackResolver();
    }

    const { error: updateError } = await supabaseAdmin
      .from("business_profiles")
      .update({ zernio_profile_id: created })
      .eq("id", bp);
    if (updateError) {
      console.warn("[Zernio] persist zernio_profile_id failed:", updateError.message);
    }
    return created;
  };
}
