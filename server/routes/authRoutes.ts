/**
 * /api/auth/* — session cookie lifecycle.
 *
 * Supabase-backed sessions exchange a bearer token for a signed HMAC cookie.
 * "Local" sessions allow unauthenticated dev usage: a random local_<hex> id
 * that the frontend can hand back via x-local-user-id for idempotency.
 */

import crypto from "crypto";
import type { AuthHelpers } from "../lib/authHelpers.ts";
import { AUTH_SESSION_COOKIE } from "../lib/authHelpers.ts";

interface AuthRoutesDeps {
  auth: AuthHelpers;
  supabaseUrl: string;
  supabaseAnonKey: string;
  debugLog: (
    runId: string,
    hypothesisId: string,
    location: string,
    message: string,
    data?: Record<string, unknown>
  ) => void;
}

export function registerAuthRoutes(app, deps: AuthRoutesDeps) {
  const { auth, supabaseUrl, supabaseAnonKey, debugLog } = deps;

  /**
   * Local (unauthenticated) sessions are a dev convenience, but combined with
   * the local<->cloud ownership bridge in authHelpers they would let any
   * anonymous visitor on a deployed instance mint a `local_*` session and
   * access cloud-owned OAuth accounts. So they are only allowed when:
   *   - explicitly opted in via ALLOW_LOCAL_SESSIONS=1, or
   *   - Supabase auth isn't configured (nothing but local mode can work), or
   *   - running outside production (local dev).
   */
  function localSessionsAllowed(): boolean {
    if (String(process.env.ALLOW_LOCAL_SESSIONS || "").trim() === "1") return true;
    if (!supabaseUrl || !supabaseAnonKey) return true;
    const isProduction =
      process.env.VERCEL === "1" || String(process.env.NODE_ENV || "") === "production";
    return !isProduction;
  }

  app.post("/api/auth/session", async (req, res) => {
    debugLog("pre-fix", "H6", "authRoutes:/api/auth/session", "Auth session sync called", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey),
      hasAuthorizationHeader: Boolean(req.headers.authorization),
    });
    if (!supabaseUrl || !supabaseAnonKey) {
      debugLog("pre-fix", "H6", "authRoutes:/api/auth/session", "Supabase server config missing", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseAnonKey: Boolean(supabaseAnonKey),
      });
      return res.status(503).json({ error: "Supabase auth is not configured on server" });
    }
    const authHeader = String(req.headers.authorization || "");
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      debugLog("pre-fix", "H6", "authRoutes:/api/auth/session", "Missing bearer token", {});
      return res.status(401).json({ error: "Missing bearer token" });
    }
    const user = await auth.verifySupabaseAccessToken(match[1]);
    if (!user) {
      debugLog("pre-fix", "H6", "authRoutes:/api/auth/session", "Supabase token verification failed", {});
      return res.status(401).json({ error: "Invalid session token" });
    }
    const cookieVal = auth.signAuthSessionCookie(String(user.id));
    auth.setAuthCookie(res, cookieVal);
    debugLog("pre-fix", "H6", "authRoutes:/api/auth/session", "Auth session synced successfully", {
      userIdPrefix: String(user.id).slice(0, 14),
      hasEmail: Boolean(user.email),
    });
    return res.json({ ok: true, user: { id: user.id, email: user.email || null } });
  });

  app.post("/api/auth/local-session", (req, res) => {
    debugLog("pre-fix", "H7", "authRoutes:/api/auth/local-session", "Local session endpoint called", {
      hasCookie: Boolean(req.headers.cookie),
      hasRequestedLocalId: Boolean(req.headers["x-local-user-id"]),
    });
    if (!localSessionsAllowed()) {
      return res.status(403).json({
        error: "local_sessions_disabled",
        message:
          "Local (unauthenticated) sessions are disabled on this deployment. Sign in with your account instead, or set ALLOW_LOCAL_SESSIONS=1 on the server to allow them.",
      });
    }
    const rawCookie = auth.parseCookies(req.headers.cookie || "")[AUTH_SESSION_COOKIE];
    const existingUser = rawCookie ? auth.verifyAuthSessionCookie(rawCookie) : null;
    if (existingUser && String(existingUser).startsWith("local_")) {
      const refreshed = auth.signAuthSessionCookie(existingUser);
      auth.setAuthCookie(res, refreshed);
      debugLog("pre-fix", "H7", "authRoutes:/api/auth/local-session", "Reused existing local session", {
        userIdPrefix: String(existingUser).slice(0, 14),
      });
      return res.json({ ok: true, user: { id: existingUser, mode: "local" } });
    }
    const requestedLocalUserId = String(req.headers["x-local-user-id"] || "").trim();
    const userId =
      /^local_[a-zA-Z0-9_-]{8,}$/.test(requestedLocalUserId)
        ? requestedLocalUserId
        : `local_${crypto.randomBytes(12).toString("hex")}`;
    const cookieVal = auth.signAuthSessionCookie(userId);
    auth.setAuthCookie(res, cookieVal);
    debugLog("pre-fix", "H7", "authRoutes:/api/auth/local-session", "Created new local session", {
      userIdPrefix: String(userId).slice(0, 14),
    });
    return res.json({ ok: true, user: { id: userId, mode: "local" } });
  });

  app.delete("/api/auth/session", (_req, res) => {
    auth.clearAuthCookie(res);
    return res.json({ ok: true });
  });
}
