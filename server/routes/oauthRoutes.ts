/**
 * OAuth routes for every connect flow supported by Automazing.
 *
 * Each platform has an `/api/auth/<platform>` init endpoint and a matching
 * `/api/auth/<platform>/callback`. Where possible, flows are tunnelled through
 * Zernio; otherwise they go against the provider's native OAuth endpoints.
 *
 * Cross-cutting state lives in `oauthPendingStore` (CSRF / PKCE state) and
 * `tokenStore` (the persistent, Supabase-backed OAuth token entries).
 */


import type { OAuthErrorExtras, OAuthPendingRecord, OAuthRoutesDeps } from "./oauth/types.ts";
import { registerMailOAuthRoutes } from "./oauth/mailOAuthRoutes.ts";
import { registerCanvaOAuthRoutes } from "./oauth/canvaOAuthRoutes.ts";
import { registerShopifyOAuthRoutes } from "./oauth/shopifyOAuthRoutes.ts";
import { registerNotionOAuthRoutes } from "./oauth/notionOAuthRoutes.ts";
import { registerMcpOAuthRoutes } from "./oauth/mcpOAuthRoutes.ts";
import { registerMetaSocialOAuthRoutes } from "./oauth/metaSocialOAuthRoutes.ts";
import { registerTikTokOAuthRoutes } from "./oauth/tiktokOAuthRoutes.ts";
import { registerXOAuthRoutes } from "./oauth/xOAuthRoutes.ts";
import { registerYouTubeOAuthRoutes } from "./oauth/youtubeOAuthRoutes.ts";
import { registerGoogleCalendarOAuthRoutes } from "./oauth/googleCalendarOAuthRoutes.ts";
import { registerOutlookCalendarOAuthRoutes } from "./oauth/outlookCalendarOAuthRoutes.ts";
import { registerGoogleReviewsOAuthRoutes } from "./oauth/googleReviewsOAuthRoutes.ts";
import { registerGoogleBusinessOAuthRoutes } from "./oauth/googleBusinessOAuthRoutes.ts";
import { registerTripadvisorOAuthRoutes } from "./oauth/tripadvisorOAuthRoutes.ts";

export type { OAuthRoutesDeps } from "./oauth/types.ts";

export function registerOAuthRoutes(app, deps: OAuthRoutesDeps): void {
  const {
    BASE_URL,
    API_BASE_URL,
    getOrCreateZernioProfileId,
    getSessionUserId,
  } = deps;

  function debugLog(runId, hypothesisId, location, message, data = {}) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[oauth]", { runId, hypothesisId, location, message, data });
    }
  }

  function buildPageUrlWithBase(baseUrl: string, page, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      query.set(key, String(value));
    }
    const suffix = query.toString();
    return `${baseUrl.replace(/\/$/, "")}/${page}${suffix ? `?${suffix}` : ""}`;
  }

  function buildPageUrl(page, params = {}) {
    return buildPageUrlWithBase(BASE_URL, page, params);
  }

  function buildOauthErrorParams(errorCode: string, extras: OAuthErrorExtras = {}) {
    return {
      oauth_error: errorCode,
      oauth_status: extras.status,
      oauth_exception: extras.exception,
      oauth_hint: extras.hint,
    };
  }

  function buildPageOauthErrorUrl(page: string, errorCode: string, extras: OAuthErrorExtras = {}) {
    return buildPageUrl(page, buildOauthErrorParams(errorCode, extras));
  }

  function originOf(raw: unknown): string | null {
    try {
      const parsed = new URL(String(raw || ""));
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      return parsed.origin;
    } catch {
      return null;
    }
  }

  /**
   * The frontend origin to send the user back to after OAuth. Prefer the
   * explicit `?app_origin=`; fall back to the request's `Referer` origin for
   * connect entry points that don't pass app_origin (e.g. the sidebar's manual
   * connect buttons). This is only ever read at connect-INIT time, where the
   * Referer is the user's own page — never at callback time (the provider would
   * be the referer there; callbacks use the stored `pending.appBaseUrl`).
   *
   * Crucially, BOTH sources are only honoured when they match an origin we
   * already trust (BASE_URL, API_BASE_URL, CORS_ORIGINS, or the origin the
   * request itself arrived on), so the post-OAuth redirect target is always
   * in the allowlist — this is not an open redirect.
   */
  /**
   * Origin the request itself was served on (custom domains included).
   * Behind Vercel the platform only routes hostnames that belong to the
   * project, and a victim's browser always sets Host from the real URL, so
   * "send the user back to the origin they are already browsing" is safe.
   * This is what keeps OAuth flows on e.g. automazing.life instead of
   * bouncing to the *.vercel.app alias.
   */
  function requestOwnOrigin(req): string | null {
    const forwardedHost = String(req?.headers?.["x-forwarded-host"] ?? "")
      .split(",")[0]
      .trim();
    const host = forwardedHost || String(req?.headers?.host ?? "").trim();
    if (!host) return null;
    const forwardedProto = String(req?.headers?.["x-forwarded-proto"] ?? "")
      .split(",")[0]
      .trim();
    const proto = forwardedProto || req?.protocol || "https";
    return originOf(`${proto}://${host}`);
  }

  /**
   * Public origin for OAuth redirect_uri values. When the user starts a
   * connect flow on a custom domain (e.g. automazing.life), Google/Meta/etc.
   * must see THAT host in redirect_uri — otherwise their consent screen says
   * "signing in to automazing.vercel.app". Falls back to the configured
   * API_BASE_URL for server-initiated flows without a browser request.
   */
  function oauthPublicBaseUrl(req?: unknown): string {
    const own = req ? requestOwnOrigin(req as Parameters<typeof requestOwnOrigin>[0]) : null;
    if (own) return own.replace(/\/$/, "");
    return String(API_BASE_URL).replace(/\/$/, "");
  }

  function oauthCallbackUrl(req: unknown, callbackPath: string): string {
    const path = callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`;
    return `${oauthPublicBaseUrl(req)}${path}`;
  }


  function requestedAppBaseUrl(req): string | null {
    const explicitAppOrigin = originOf(req?.query?.app_origin);
    const refererOrigin = originOf(req?.headers?.referer ?? req?.headers?.referrer);
    // Connect clicks always send matching app_origin + Referer from the user's
    // tab — honour that pair even before CORS_ORIGINS is configured (e.g.
    // automazing.life while BASE_URL still points at *.vercel.app).
    if (
      explicitAppOrigin &&
      refererOrigin &&
      explicitAppOrigin === refererOrigin &&
      !originHostIsLoopback(explicitAppOrigin)
    ) {
      return explicitAppOrigin;
    }

    function isTrustedVercelAppOrigin(candidate: string): boolean {
      try {
        const host = new URL(candidate).hostname.toLowerCase();
        if (!host.endsWith(".vercel.app")) return false;
        const knownHosts = [originOf(BASE_URL), originOf(API_BASE_URL)]
          .filter(Boolean)
          .map((origin) => new URL(origin as string).hostname.toLowerCase())
          .filter((hostName) => hostName.endsWith(".vercel.app"));
        for (const knownHost of knownHosts) {
          if (host === knownHost) return true;
          const alias = knownHost.replace(/\.vercel\.app$/, "");
          if (alias && host.startsWith(`${alias}-`)) return true;
          const aliasRoot = alias.split("-")[0];
          if (aliasRoot && host.startsWith(`${aliasRoot}-`)) return true;
        }
      } catch {
        // Invalid candidate origins are rejected below.
      }
      return false;
    }

    const corsOrigins = String(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((value) => originOf(value.trim()))
      .filter(Boolean);
    const siteOrigins = ["SITE_URL", "VITE_SITE_URL", "VITE_APP_URL"]
      .map((key) => originOf(process.env[key]))
      .filter(Boolean);
    const vercelProductionOrigin = originOf(
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${String(process.env.VERCEL_PROJECT_PRODUCTION_URL).replace(/^https?:\/\//, "")}`
        : ""
    );
    const vercelCurrentOrigin = originOf(
      process.env.VERCEL_URL
        ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, "")}`
        : ""
    );
    const knownOrigins = [
      originOf(BASE_URL),
      originOf(API_BASE_URL),
      vercelProductionOrigin,
      vercelCurrentOrigin,
      requestOwnOrigin(req),
      ...corsOrigins,
      ...siteOrigins,
    ].filter(Boolean);
    const candidates = [
      originOf(req?.query?.app_origin),
      originOf(req?.headers?.referer ?? req?.headers?.referrer),
    ];
    for (const candidate of candidates) {
      if (candidate && knownOrigins.includes(candidate)) return candidate;
      if (candidate && isTrustedVercelAppOrigin(candidate)) return candidate;
    }
    return null;
  }

  function getExceptionMessage(error: unknown) {
    if (!error) return undefined;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  function requireSessionOrRedirect(req, res, page) {
    const userId = getSessionUserId(req);
    if (!userId) {
      // Send the error back to the origin the user is actually browsing on
      // (custom domain), not the canonical BASE_URL fallback.
      const base = requestedAppBaseUrl(req) || BASE_URL;
      res.redirect(
        buildPageUrlWithBase(
          base,
          page,
          buildOauthErrorParams("not_authenticated", {
            status: 401,
            exception: "No active session found on the server.",
          })
        )
      );
      return null;
    }

    return userId;
  }


  function oauthPageForPlatform(platform) {
    if (
      platform === "google_calendar" ||
      platform === "outlook_calendar"
    ) {
      return "calendar";
    }
    if (platform === "gmail" || platform === "outlook") {
      return "messages";
    }
    if (platform === "google_drive") {
      return "content";
    }
    if (platform === "canva") {
      return "content";
    }
    if (platform === "google_reviews" || platform === "tripadvisor") {
      return "reviews";
    }
    if (platform === "shopify" || platform === "notion") {
      return "ecommerce";
    }
    if (platform === "google_ads" || platform === "meta_business") {
      return "marketing";
    }
    if (platform === "dayai") {
      return "customers";
    }
    if (platform === "windsor" || platform === "supermetrics_mcp") {
      return "marketing";
    }
    if (platform === "era") {
      return "connections";
    }
    if (platform === "superhuman_mcp") {
      return "messages";
    }
    return "social-media";
  }

  function oauthRedirectTo(
    baseUrl: string,
    platform: string,
    query: string,
    oauthReturnPage?: string | null
  ) {
    let page;
    if (oauthReturnPage === "connections") {
      page = "connections";
    } else if (oauthReturnPage === "connect-accounts" || oauthReturnPage === "integrations") {
      page = "integrations";
    } else {
      page = oauthPageForPlatform(platform);
    }
    return `${baseUrl.replace(/\/$/, "")}/${page}?${query}`;
  }


  function originHostIsLoopback(origin: string | null): boolean {
    if (!origin) return true;
    try {
      const host = new URL(origin).hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1";
    } catch {
      return true;
    }
  }

  function appOriginFromRedirectUri(redirectUri: unknown): string | null {
    try {
      const origin = new URL(String(redirectUri || "")).origin;
      if (!originHostIsLoopback(origin)) return origin;
    } catch {
      // ignore malformed redirect URIs
    }
    return null;
  }

  /**
   * Origin to send the user back to after OAuth. Prefer the frontend origin the
   * connect request actually came from (captured into `pending.appBaseUrl` from
   * a trusted `app_origin`) over the server's configured BASE_URL — otherwise a
   * user on a different-but-trusted origin lands on BASE_URL, where their
   * (localStorage) session doesn't exist and they appear logged out.
   */
  function postOauthBaseUrl(pending: OAuthPendingRecord | null | undefined): string {
    if (pending?.appBaseUrl) return pending.appBaseUrl;
    const fromRedirect = appOriginFromRedirectUri(pending?.redirectUri);
    if (fromRedirect) return fromRedirect;
    return BASE_URL;
  }

  /**
   * Optional `?oauth_return=...` on /api/auth/* to land on a specific page after OAuth.
   * Accepted values:
   *   - "connections"                        -> Connections Center
   *   - "integrations" / "connect-accounts"  -> Integrations hub (legacy alias)
   * Anything else returns null and the callback falls back to the per-platform
   * landing page (e.g. social-media, calendar, messages, ...).
   */
  function parseOauthReturnPage(req) {
    const v = String(req.query?.oauth_return || "").trim();
    if (v === "connections") return "connections";
    if (v === "connect-accounts" || v === "integrations") return "integrations";
    return null;
  }

  function postOauthPage(pending, platform) {
    const ret = pending?.oauthReturnPage;
    if (ret === "connections") return "connections";
    if (ret === "connect-accounts" || ret === "integrations") return "integrations";
    return oauthPageForPlatform(platform);
  }

  function isAllowedOAuthCallbackUser(pending, callbackUserId: string | null): boolean {
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    if (!pendingUserId || !callbackUserIdStr) return false;
    if (pendingUserId === callbackUserIdStr) return true;
    return pendingUserId.startsWith("local_");
  }

  async function getOptionalZernioProfileId(
    label: string,
    businessProfileId?: string | null
  ): Promise<string | null> {
    const zernioProfileId = await getOrCreateZernioProfileId(businessProfileId);
    if (!zernioProfileId) {
      console.warn(
        `[Zernio ${label}] Could not resolve a Zernio profile; continuing without profileId. ` +
          "Set ZERNIO_PROFILE_ID if this Zernio workspace requires one."
      );
    }
    return zernioProfileId;
  }

  registerMetaSocialOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
    oauthPageForPlatform,
    getOptionalZernioProfileId,
  });

  registerTikTokOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
  });

  registerXOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
  });

  registerYouTubeOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
  });

  registerShopifyOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
  });

  registerNotionOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
  });

  registerGoogleCalendarOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
  });

  registerOutlookCalendarOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
  });

  registerGoogleReviewsOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
    getOptionalZernioProfileId,
  });

  registerGoogleBusinessOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
    getOptionalZernioProfileId,
  });

  registerTripadvisorOAuthRoutes(app, deps, {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
    getOptionalZernioProfileId,
  });

  registerMailOAuthRoutes(app, deps, {
    debugLog,
    buildPageUrlWithBase,
    buildOauthErrorParams,
    oauthCallbackUrl,
    requestedAppBaseUrl,
    requireSessionOrRedirect,
    oauthPageForPlatform,
    parseOauthReturnPage,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
  });

  registerCanvaOAuthRoutes(app, deps, {
    debugLog,
    buildPageUrlWithBase,
    buildOauthErrorParams,
    oauthCallbackUrl,
    requestedAppBaseUrl,
    requireSessionOrRedirect,
    oauthPageForPlatform,
    parseOauthReturnPage,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    getExceptionMessage,
  });

  registerMcpOAuthRoutes(app, deps, {
    debugLog,
    buildPageUrlWithBase,
    buildOauthErrorParams,
    oauthCallbackUrl,
    requestedAppBaseUrl,
    requireSessionOrRedirect,
    oauthPageForPlatform,
    parseOauthReturnPage,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    getExceptionMessage,
  });

}
