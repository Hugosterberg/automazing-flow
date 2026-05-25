/**
 * Auth helpers: HMAC-signed session cookies, Supabase token verification,
 * session lookup from request cookies, and account ownership checks.
 *
 * The cookie is stateless and verified via HMAC so sessions survive across
 * Vercel serverless instances (no in-memory map).
 */

import crypto from "crypto";

export const AUTH_SESSION_COOKIE = "automazing_session";
export const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AuthHelperDeps {
  baseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export type StoredAccount = Record<string, unknown> & {
  ownerUserId?: string | null;
  platform?: string | null;
  isLate?: boolean;
  lateAccountId?: string;
  instagramViaZernio?: boolean;
  zernioAccountId?: string;
};

export interface RequestLike {
  headers: { cookie?: string };
}

export interface ResponseLike {
  setHeader: (name: string, value: string) => void;
}

export interface AccountAccessResult {
  allowed: boolean;
  migrate: boolean;
  reason: string;
}

export interface AuthHelpers {
  parseCookies(cookieHeader?: string): Record<string, string>;
  signAuthSessionCookie(userId: string): string;
  verifyAuthSessionCookie(raw: string): string | null;
  getSessionUserId(req: RequestLike): string | null;
  getStoredAccountAccess(stored: StoredAccount | null | undefined, userId: string): AccountAccessResult;
  verifySupabaseAccessToken(token: string): Promise<{ id: string; email?: string } | null>;
  setAuthCookie(res: ResponseLike, cookieValue: string): void;
  clearAuthCookie(res: ResponseLike): void;
  normalizeStoredAccount(stored: StoredAccount | null | undefined): StoredAccount | null | undefined;
}

/**
 * HMAC-signed session cookie secret. Prefers `AUTH_SESSION_SECRET` and falls
 * back to the Zernio key for local dev. Read lazily so process.env changes
 * (e.g. after /api/settings/api-keys writes) are picked up.
 */
function getAuthSessionSigningSecret(): string {
  const s = (
    process.env.AUTH_SESSION_SECRET ||
    process.env.ZERNIO_API_KEY ||
    process.env.LATE_API_KEY ||
    ""
  ).trim();
  if (s) return s;
  if (process.env.VERCEL === "1") {
    console.warn(
      "[auth] Set AUTH_SESSION_SECRET (or rely on ZERNIO_API_KEY) so session cookies can be verified on all instances."
    );
  }
  return "automazing-dev-session-signing-key";
}

export function createAuthHelpers(deps: AuthHelperDeps): AuthHelpers {
  const { baseUrl, supabaseUrl, supabaseAnonKey } = deps;

  function parseCookies(cookieHeader = ""): Record<string, string> {
    const out: Record<string, string> = {};
    cookieHeader.split(";").forEach((part) => {
      const [rawKey, ...rest] = part.trim().split("=");
      if (!rawKey) return;
      out[rawKey] = decodeURIComponent(rest.join("=") || "");
    });
    return out;
  }

  function signAuthSessionCookie(userId: string): string {
    const exp = Date.now() + AUTH_SESSION_TTL_MS;
    const payload = Buffer.from(
      JSON.stringify({ u: String(userId), exp }),
      "utf8"
    ).toString("base64url");
    const secret = getAuthSessionSigningSecret();
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  function verifyAuthSessionCookie(raw: string): string | null {
    if (!raw || typeof raw !== "string") return null;
    const dot = raw.indexOf(".");
    if (dot <= 0 || dot >= raw.length - 1) return null;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const secret = getAuthSessionSigningSecret();
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        u?: string;
        exp?: number;
      };
      if (!json || typeof json.u !== "string" || typeof json.exp !== "number") return null;
      if (json.exp < Date.now()) return null;
      return json.u;
    } catch {
      return null;
    }
  }

  function getSessionUserId(req: RequestLike): string | null {
    const raw = parseCookies(req.headers.cookie || "")[AUTH_SESSION_COOKIE];
    if (!raw) return null;
    return verifyAuthSessionCookie(raw);
  }

  function getStoredAccountAccess(
    stored: StoredAccount | null | undefined,
    userId: string
  ): AccountAccessResult {
    const ownerUserId = stored?.ownerUserId ? String(stored.ownerUserId) : "";
    if (!ownerUserId) return { allowed: true, migrate: true, reason: "unowned" };
    if (ownerUserId === userId) return { allowed: true, migrate: false, reason: "owner_match" };

    const sameLocalPair = ownerUserId.startsWith("local_") && String(userId).startsWith("local_");
    if (sameLocalPair) return { allowed: true, migrate: true, reason: "local_pair" };

    const oauthOwnerBridgePlatforms = [
      "gmail",
      "google_drive",
      "google_calendar",
      "google_reviews",
      "outlook",
      "notion",
      "shopify",
      "tripadvisor",
      "google_business",
      "instagram",
      "facebook",
      "whatsapp",
      "google_ads",
      "meta_business",
    ];

    const localToCloudGoogleMigration =
      ownerUserId.startsWith("local_") &&
      !String(userId).startsWith("local_") &&
      oauthOwnerBridgePlatforms.includes(String(stored?.platform || ""));

    if (localToCloudGoogleMigration) {
      return { allowed: true, migrate: true, reason: "local_to_cloud_google" };
    }

    const cloudToLocalGoogleMigration =
      Boolean(ownerUserId) &&
      !ownerUserId.startsWith("local_") &&
      String(userId).startsWith("local_") &&
      oauthOwnerBridgePlatforms.includes(String(stored?.platform || ""));

    if (cloudToLocalGoogleMigration) {
      return { allowed: true, migrate: true, reason: "cloud_to_local_google" };
    }

    return { allowed: false, migrate: false, reason: "owner_mismatch" };
  }

  async function verifySupabaseAccessToken(
    token: string
  ): Promise<{ id: string; email?: string } | null> {
    if (!supabaseUrl || !supabaseAnonKey || !token) return null;
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return null;
      const user = (await res.json().catch(() => ({}))) as { id?: string; email?: string };
      if (!user?.id) return null;
      return { id: user.id, email: user.email };
    } catch {
      return null;
    }
  }

  function setAuthCookie(res: ResponseLike, cookieValue: string): void {
    const secure = baseUrl.startsWith("https://");
    const attrs = [
      `${AUTH_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(AUTH_SESSION_TTL_MS / 1000)}`,
    ];
    if (secure) attrs.push("Secure");
    res.setHeader("Set-Cookie", attrs.join("; "));
  }

  function clearAuthCookie(res: ResponseLike): void {
    const secure = baseUrl.startsWith("https://");
    const attrs = [`${AUTH_SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (secure) attrs.push("Secure");
    res.setHeader("Set-Cookie", attrs.join("; "));
  }

  /** Older tokens.json entries may still use isLate / lateAccountId. */
  function normalizeStoredAccount(
    stored: StoredAccount | null | undefined
  ): StoredAccount | null | undefined {
    if (!stored || typeof stored !== "object") return stored;
    const s: StoredAccount = { ...stored };
    if (s.isLate && !s.instagramViaZernio) s.instagramViaZernio = true;
    if (s.lateAccountId && !s.zernioAccountId) s.zernioAccountId = s.lateAccountId;
    return s;
  }

  return {
    parseCookies,
    signAuthSessionCookie,
    verifyAuthSessionCookie,
    getSessionUserId,
    getStoredAccountAccess,
    verifySupabaseAccessToken,
    setAuthCookie,
    clearAuthCookie,
    normalizeStoredAccount,
  };
}
