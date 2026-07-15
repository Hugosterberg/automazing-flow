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

import crypto from "crypto";
import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";
import type { SecretResolver } from "../lib/secretResolver.ts";
import { fetchZernio, zernioFetchErrorMessage } from "../lib/zernioFetch.ts";
import {
  deterministicAccountId,
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../lib/accountIdentity.ts";
import { exchangeForLongLivedInstagramToken } from "../providers/instagram.ts";
import { getShopifyScopes, getShopifyScopeDiagnostics } from "../lib/shopifyScopes.ts";
import { buildOAuthCallbackErrorQuery } from "../lib/oauthPermissionErrors.ts";
import { exchangeCanvaOAuthCode, fetchCanvaUserIdentity } from "../providers/canva.ts";
import {
  OAUTH_MCP_DIRECTORY,
  isOauthMcpPlatform,
  registerMcpOauthClient,
  exchangeMcpOauthCode,
  connectOauthMcp,
} from "../providers/mcpOauth.ts";

interface OAuthPendingRecord {
  platform: string;
  userId?: string | null;
  profileId?: string | null;
  businessProfileId?: string | null;
  appBaseUrl?: string | null;
  zernioProfileId?: string | null;
  codeVerifier?: string;
  createdAt?: number;
  oauthReturnPage?: string | undefined;
  [key: string]: unknown;
}

interface OAuthPendingStore {
  get: (state: string | null | undefined) => Promise<OAuthPendingRecord | null>;
  set: (state: string, value: OAuthPendingRecord) => Promise<unknown>;
  delete: (state: string | null | undefined) => Promise<unknown>;
  listZernioRecentForUser: (
    userId: string
  ) => Promise<Array<[string, OAuthPendingRecord]>>;
}

interface TokenStore {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
  delete: (id: string) => Promise<unknown>;
}

interface OAuthRoutesDeps {
  BASE_URL: string;
  API_BASE_URL: string;
  ZERNIO_API_BASE: string;
  zernio: ZernioModule;
  getZernioApiKey: () => string;
  getOrCreateZernioProfileId: (businessProfileId?: string | null) => Promise<string | null>;
  secretResolver: SecretResolver;
  normalizeZernioAccountsPayload: (body: unknown) => unknown[];
  mapZernioPlatform: (raw: string | undefined) => string | null;
  generateState: () => string;
  oauthPendingStore: OAuthPendingStore;
  tokenStore: TokenStore;
  getSessionUserId: (req: unknown) => string | null;
}

interface ZernioConnectUrlArgs {
  ZERNIO_API_BASE: string;
  zernioKey: string;
  platformSlugs: string[];
  profileId?: string | null;
  redirectUrl: string;
  extraParams?: Record<string, string | null | undefined>;
}

interface ResolveZernioAccountArgs {
  zernio: ZernioModule;
  mapZernioPlatform: (raw: string | undefined) => string | null;
  desiredPlatform: string;
  queryAccountId?: unknown;
  queryUsername?: unknown;
}

interface PopupOAuthResult {
  type: string;
  error?: string | null;
  statusCode?: string | null;
  exception?: string | null;
  hint?: string | null;
  [key: string]: unknown;
}

interface OAuthErrorExtras {
  status?: string | number | null;
  exception?: unknown;
  hint?: unknown;
}

const IG_AUTH = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
const META_BUSINESS_DEFAULT_SCOPES =
  "public_profile email business_management ads_read ads_management pages_show_list";
const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const X_AUTH = "https://x.com/i/oauth2/authorize";
const X_TOKEN = "https://api.x.com/2/oauth2/token";
const X_TOKEN_LEGACY = "https://api.twitter.com/2/oauth2/token";
const X_SCOPES = "tweet.read users.read offline.access like.read";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const NOTION_AUTH = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN = "https://api.notion.com/v1/oauth/token";
const CANVA_AUTH = "https://www.canva.com/api/oauth/authorize";
const YOUTUBE_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile";
const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
const GOOGLE_DRIVE_SCOPES =
  "openid email profile https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_CALENDAR_SCOPES =
  "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
const GOOGLE_REVIEWS_SCOPES =
  "openid email profile https://www.googleapis.com/auth/business.manage";
const GOOGLE_ADS_SCOPES =
  "openid email profile https://www.googleapis.com/auth/adwords";
const OUTLOOK_CALENDAR_SCOPES =
  "offline_access openid profile email User.Read Calendars.ReadWrite";
const CANVA_SCOPES = "design:content:read";

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
function profileParam(profileId: string | null | undefined): string {
  return profileId ? `&profile_id=${encodeURIComponent(profileId)}` : "";
}

function normalizeRequestedProfileId(profileId: unknown): string | null {
  const normalized = String(profileId || "").trim();
  if (!normalized || normalized === "default") {
    return null;
  }
  return normalized;
}

/**
 * Tenant (business profile) id from the connect request. Used to resolve the
 * tenant's own Zernio profile and per-tenant secrets. Falsy → shared/global.
 */
function requestBusinessProfileId(req): string | null {
  const normalized = String(
    req?.query?.business_profile_id || req?.body?.business_profile_id || ""
  ).trim();
  return normalized.length > 0 ? normalized : null;
}

function buildContentUrl(baseUrl: string, params: Record<string, unknown> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return `${baseUrl}/content${suffix ? `?${suffix}` : ""}`;
}

function popupTargetOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "*";
  }
}

function sendPopupOAuthResult(
  res,
  payload: PopupOAuthResult,
  fallbackUrl: string,
  baseUrl: string
): void {
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const serializedFallbackUrl = JSON.stringify(fallbackUrl);
  const serializedTargetOrigin = JSON.stringify(popupTargetOrigin(baseUrl));

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Google Drive connection</title>
  </head>
  <body style="margin:0;background:#000;color:#f5f5f5;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;">
    <p style="opacity:.85;">Completing Google Drive connection...</p>
    <script>
      const payload = ${serializedPayload};
      const fallbackUrl = ${serializedFallbackUrl};
      const targetOrigin = ${serializedTargetOrigin};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, targetOrigin);
        window.close();
      }
      if (!window.closed) {
        window.location.replace(fallbackUrl);
      }
    </script>
  </body>
</html>`);
}

/**
 * Structured Zernio connect failure. `code` maps to a known oauth_error key
 * and `hint` carries Zernio's actual reason (plan limit, unsupported platform,
 * upstream outage, …) so the user sees WHY the connect was refused instead of
 * a generic "connect failed".
 */
class ZernioConnectError extends Error {
  code: string;
  hint: string;
  constructor(code: string, hint: string) {
    super(code);
    this.code = code;
    this.hint = hint;
  }
}

/** `oauth_error=<code>&oauth_hint=<reason>` query for redirect URLs. */
function zernioOauthErrorQuery(e: unknown, fallbackCode = "zernio_init_failed"): string {
  const err = e as { code?: string; hint?: string; message?: string } | null;
  const code = String(err?.code || fallbackCode);
  const hint = String(err?.hint || err?.message || "").slice(0, 240);
  return `oauth_error=${encodeURIComponent(code)}${hint ? `&oauth_hint=${encodeURIComponent(hint)}` : ""}`;
}

/** Human-readable reason out of a failed Zernio connect response body. */
function zernioConnectFailureHint(status: number, rawBody: string, platformSlug: string): string {
  const upstream = rawBody.slice(0, 200);
  try {
    const parsed = JSON.parse(rawBody) as { message?: unknown; error?: unknown; code?: unknown };
    const failure = describeZernioFailure({
      status,
      error:
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.error === "string"
            ? parsed.error
            : "",
      data: parsed,
    });
    return failure.message;
  } catch {
    // Body was not JSON (e.g. an HTML 404 page) — fall back to a generic line.
  }
  if (status === 404) {
    return `Zernio has no connect endpoint for "${platformSlug}" — the platform may not be available on your Zernio plan.`;
  }
  return `Zernio replied ${status} on connect/${platformSlug}${upstream ? `: ${upstream}` : ""}`;
}

async function getZernioConnectUrl({
  ZERNIO_API_BASE,
  zernioKey,
  platformSlugs,
  profileId,
  redirectUrl,
  extraParams,
}: ZernioConnectUrlArgs): Promise<string> {
  let lastErr: ZernioConnectError | null = null;
  for (const platformSlug of platformSlugs) {
    const connectUrl = new URL(`${ZERNIO_API_BASE}/connect/${platformSlug}`);
    if (profileId) connectUrl.searchParams.set("profileId", profileId);
    connectUrl.searchParams.set("redirect_url", redirectUrl);
    if (extraParams && typeof extraParams === "object") {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v != null) connectUrl.searchParams.set(k, String(v));
      }
    }

    let connectRes: Response;
    try {
      connectRes = await fetchZernio(connectUrl.toString(), {
        headers: { Authorization: `Bearer ${zernioKey}` },
      });
    } catch (error) {
      const message = zernioFetchErrorMessage(error);
      console.warn(`[Zernio] connect/${platformSlug} request failed:`, message);
      lastErr = new ZernioConnectError(
        "zernio_fetch_failed",
        `Could not reach Zernio (connect/${platformSlug}): ${message}`
      );
      continue;
    }
    if (!connectRes.ok) {
      const err = await connectRes.text().catch(() => "");
      console.warn(`[Zernio] connect/${platformSlug} failed:`, connectRes.status, err.slice(0, 200));
      lastErr = new ZernioConnectError(
        "zernio_connect_failed",
        zernioConnectFailureHint(connectRes.status, err, platformSlug)
      );
      continue;
    }
    const data = await connectRes.json().catch(() => ({}));
    if (data.authUrl) {
      return data.authUrl;
    }
    lastErr = new ZernioConnectError(
      "zernio_no_auth_url",
      `Zernio accepted connect/${platformSlug} but returned no login link — try again, or contact Zernio support if it persists.`
    );
  }
  throw lastErr || new ZernioConnectError("zernio_connect_failed", "Zernio refused the connect request.");
}

function parseLocationsFromBody(body): unknown[] {
  const candidateLists = [
    body?.locations,
    body?.data?.locations,
    body?.data,
    body?.items,
    body?.businessLocations,
  ];
  for (const list of candidateLists) {
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  }
  return [];
}

function getLocationId(location): string | null {
  if (!location || typeof location !== "object") return null;
  return String(
    location.locationId ??
      location.id ??
      location.name ??
      location.resourceName ??
      ""
  ).trim() || null;
}

async function resolveAndSelectGoogleBusinessLocation({
  ZERNIO_API_BASE,
  apiKey,
  connectToken,
}: {
  ZERNIO_API_BASE: string;
  apiKey: string;
  connectToken: string;
}): Promise<void> {
  const headers = { Authorization: `Bearer ${apiKey}`, "X-Connect-Token": connectToken };
  const listEndpoints = [
    `${ZERNIO_API_BASE}/connect/list-google-business-locations`,
    `${ZERNIO_API_BASE}/connect/google-business/select-location`,
  ];

  let locations = [];
  for (const endpoint of listEndpoints) {
    const r = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) continue;
    const body = await r.json().catch(() => ({}));
    locations = parseLocationsFromBody(body);
    if (locations.length > 0) break;
  }
  if (locations.length === 0) {
    throw new Error("zernio_gmb_no_locations");
  }

  const locationId = getLocationId(locations[0]);
  if (!locationId) {
    throw new Error("zernio_gmb_no_location_id");
  }

  const selectEndpoints = [
    `${ZERNIO_API_BASE}/connect/select-google-business-location`,
    `${ZERNIO_API_BASE}/connect/google-business/select-location`,
  ];
  const bodies = [
    { locationId },
    { id: locationId },
    { location: locationId },
  ];

  for (const endpoint of selectEndpoints) {
    for (const body of bodies) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) return;
    }
  }
  throw new Error("zernio_gmb_select_failed");
}

async function resolveZernioAccountAfterCallback({
  zernio,
  mapZernioPlatform,
  desiredPlatform,
  queryAccountId,
  queryUsername,
}: ResolveZernioAccountArgs): Promise<{
  accountId: string | null | undefined;
  username: string | null | undefined;
  rawPlatform: string | null;
}> {
  let accountId = typeof queryAccountId === "string" && queryAccountId.trim() ? queryAccountId.trim() : null;
  let username = typeof queryUsername === "string" && queryUsername.trim() ? queryUsername.trim() : null;
  let rawPlatform: string | null = null;

  if (accountId && username) {
    return { accountId, username, rawPlatform };
  }

  const result = await zernio.listAccounts();
  if (!result.ok) {
    throw new Error("zernio_fetch_accounts_failed");
  }
  const list = result.accounts;

  const matchedByPlatform = list.find(
    (a) =>
      mapZernioPlatform(a.platform || a.type || a.provider || a.channel) === desiredPlatform
  );
  const acc = matchedByPlatform || (list.length ? list[list.length - 1] : null);
  if (!acc) {
    throw new Error("zernio_no_account");
  }

  accountId = accountId || acc._id || acc.id || acc.accountId;
  username =
    username ||
    acc.username ||
    acc.name ||
    acc.displayName ||
    acc.handle ||
    acc.phoneNumber ||
    acc.phone;
  rawPlatform = acc.platform || acc.type || acc.provider || acc.channel || null;

  if (!accountId) {
    throw new Error("zernio_no_account");
  }

  return { accountId, username, rawPlatform };
}

async function fetchXToken(
  body: URLSearchParams,
  headers: Record<string, string>
): Promise<Response> {
  const primary = await fetch(X_TOKEN, { method: "POST", headers, body: body.toString(), signal: AbortSignal.timeout(15_000) });
  if (primary.ok) return primary;
  return fetch(X_TOKEN_LEGACY, { method: "POST", headers, body: body.toString(), signal: AbortSignal.timeout(15_000) });
}

export function registerOAuthRoutes(app, deps: OAuthRoutesDeps): void {
  const {
    BASE_URL,
    API_BASE_URL,
    ZERNIO_API_BASE,
    zernio,
    getZernioApiKey,
    getOrCreateZernioProfileId,
    normalizeZernioAccountsPayload,
    mapZernioPlatform,
    generateState,
    oauthPendingStore,
    tokenStore,
    getSessionUserId,
    secretResolver,
  } = deps;
  function getShopifyPublicBaseUrl() {
    const raw = String(process.env.SHOPIFY_APP_URL || API_BASE_URL || "").trim();
    return raw.replace(/\/$/, "");
  }

  function getNotionPublicBaseUrl() {
    const raw = String(process.env.NOTION_APP_URL || API_BASE_URL || "").trim();
    return raw.replace(/\/$/, "");
  }

  function getCanvaClientId() {
    return String(process.env.CANVA_CLIENT_ID || "").trim();
  }

  function getCanvaClientSecret() {
    return String(process.env.CANVA_CLIENT_SECRET || "").trim();
  }

  function canvaScope() {
    return String(process.env.CANVA_SCOPES || CANVA_SCOPES).trim();
  }

  function getMetaGraphVersion() {
    return String(process.env.META_GRAPH_VERSION || "v20.0").trim().replace(/^\/+|\/+$/g, "");
  }

  function getMetaAppId() {
    return String(
      process.env.META_APP_ID ||
        process.env.FACEBOOK_CLIENT_ID ||
        process.env.FACEBOOK_APP_ID ||
        ""
    ).trim();
  }

  function getMetaAppSecret() {
    return String(
      process.env.META_APP_SECRET ||
        process.env.FACEBOOK_CLIENT_SECRET ||
        process.env.FACEBOOK_APP_SECRET ||
        ""
    ).trim();
  }

  function getMetaBusinessScopes() {
    return String(process.env.META_BUSINESS_SCOPES || META_BUSINESS_DEFAULT_SCOPES).trim();
  }

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

  function getGmailRedirectUri(req?: unknown) {
    return oauthCallbackUrl(req, "/api/auth/google/callback");
  }

  function getCanvaRedirectUri(req?: unknown) {
    return oauthCallbackUrl(req, "/api/auth/canva/callback");
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

  function buildPendingMessagesUrl(
    pending: OAuthPendingRecord | null | undefined,
    params: Record<string, unknown>
  ) {
    return buildPageUrlWithBase(postOauthBaseUrl(pending), postOauthPage(pending, "gmail"), params);
  }

  function getExceptionMessage(error: unknown) {
    if (!error) return undefined;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  function buildPopupOauthErrorPayload(errorCode: string, extras: OAuthErrorExtras = {}) {
    return {
      type: "google_drive_oauth",
      error: errorCode,
      statusCode: extras.status ? String(extras.status) : null,
      exception: extras.exception ? String(extras.exception) : null,
      hint: extras.hint ? String(extras.hint) : null,
    };
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

  async function startOfficialGoogleAdsOAuth(req, res, userId, hubReturn) {
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=google_ads_not_configured", hubReturn || undefined)
      );
    }

    const state = generateState();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    await oauthPendingStore.set(state, {
      platform: "google_ads",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: hubReturn || undefined,
    });

    const redirectUri = oauthCallbackUrl(req, "/api/auth/google_ads/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_ADS_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  }

  async function startOfficialMetaBusinessOAuth(req, res, userId, hubReturn) {
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const appId = getMetaAppId();
    if (!appId) {
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=meta_business_not_configured", hubReturn || undefined)
      );
    }

    const state = generateState();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    await oauthPendingStore.set(state, {
      platform: "meta_business",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: hubReturn || undefined,
    });

    const redirectUri = oauthCallbackUrl(req, "/api/auth/meta_business/callback");
    const url = new URL(`https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", getMetaBusinessScopes());
    url.searchParams.set("state", state);
    const loginConfigId = String(process.env.META_LOGIN_CONFIG_ID || "").trim();
    if (loginConfigId) url.searchParams.set("config_id", loginConfigId);
    return res.redirect(url.toString());
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

  function oauthRedirect(platform: string, query: string, oauthReturnPage?: string | null) {
    return oauthRedirectTo(BASE_URL, platform, query, oauthReturnPage);
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

  // Instagram: via Zernio (recommended) eller direkt Meta OAuth
  app.get("/api/auth/instagram", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    res.set("Cache-Control", "no-store, no-cache");
    const zernioKey = getZernioApiKey();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    // Send the user back to the origin they came from, not a hardcoded
    // BASE_URL — a mismatch logs them out (session lives per-origin).
    const appBaseUrl = requestedAppBaseUrl(req);
    const base = appBaseUrl || BASE_URL;
    console.log(
      "[Instagram] ZERNIO_API_KEY:",
      zernioKey ? "set" : "not set — add ZERNIO_API_KEY to .env.local"
    );

    if (zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
        if (!zernioProfileId) {
          return res.redirect(`${base}/${returnPage}?oauth_error=zernio_profile_failed`);
        }
        const state = generateState();
        await oauthPendingStore.set(state, {
          platform: "instagram",
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          appBaseUrl,
          createdAt: Date.now(),
          oauthReturnPage: parseOauthReturnPage(req) || undefined,
        });
        const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/instagram/callback?state=${state}`);
        const connectUrl = new URL(`${ZERNIO_API_BASE}/connect/instagram`);
        connectUrl.searchParams.set("profileId", zernioProfileId);
        connectUrl.searchParams.set("redirect_url", redirectUrl);

        const connectRes = await fetchZernio(connectUrl.toString(), {
          headers: { Authorization: `Bearer ${zernioKey}` },
        });
        if (!connectRes.ok) {
          const err = await connectRes.text().catch(() => "");
          console.error("[Zernio] Instagram connect URL error:", connectRes.status, err.slice(0, 200));
          const hint = zernioConnectFailureHint(connectRes.status, err, "instagram");
          return res.redirect(
            `${base}/${returnPage}?oauth_error=zernio_connect_failed&oauth_hint=${encodeURIComponent(hint.slice(0, 240))}`
          );
        }
        const { authUrl } = await connectRes.json();
        if (!authUrl) {
          return res.redirect(`${base}/${returnPage}?oauth_error=zernio_no_auth_url`);
        }
        return res.redirect(authUrl);
      } catch (err) {
        console.error("[Zernio] Instagram init error:", err);
        return res.redirect(`${base}/${returnPage}?${zernioOauthErrorQuery(err)}`);
      }
    }

    const clientId = (process.env.INSTAGRAM_CLIENT_ID || "").trim();
    if (!clientId) {
      console.warn(
        "Instagram: ZERNIO_API_KEY is missing (length: %s). Add ZERNIO_API_KEY from zernio.com, or set INSTAGRAM_* for direct Meta OAuth.",
        (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").length
      );
      return res.redirect(`${base}/${returnPage}?oauth_error=instagram_not_configured`);
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "instagram",
      userId,
      profileId: ourProfileId,
      appBaseUrl,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/instagram/callback");
    const url = new URL(IG_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user_profile,user_media");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  async function handleZernioInstagramCallback(req, res) {
    const { state, error, accountId: queryAccountId, username } = req.query;
    const pendingEarly = state ? await oauthPendingStore.get(state) : null;
    const pageEarly = postOauthPage(pendingEarly, "instagram");
    const earlyBase = postOauthBaseUrl(pendingEarly);
    if (error) {
      return res.redirect(`${earlyBase}/${pageEarly}?oauth_error=${encodeURIComponent(error)}`);
    }
    const pending = await oauthPendingStore.get(state);
    if (!pending || pending.platform !== "instagram") {
      return res.redirect(`${earlyBase}/${pageEarly}?oauth_error=invalid_state`);
    }
    const base = postOauthBaseUrl(pending);
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalPairMismatch =
      pendingUserId.startsWith("local_") &&
      callbackUserIdStr.startsWith("local_") &&
      pendingUserId !== callbackUserIdStr;

    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition && !isLocalPairMismatch) {
      await oauthPendingStore.delete(state);
      return res.redirect(`${base}/${postOauthPage(pending, "instagram")}?oauth_error=invalid_state`);
    }
    const successPage = postOauthPage(pending, "instagram");
    await oauthPendingStore.delete(state);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(`${base}/${successPage}?oauth_error=zernio_not_configured`);
    }

    try {
      let accountId = queryAccountId;
      let displayUsername = username;
      if (!accountId || !displayUsername) {
        const result = await zernio.listAccounts();
        if (!result.ok) {
          return res.redirect(`${base}/${successPage}?oauth_error=zernio_fetch_accounts_failed`);
        }
        const list = result.accounts;
        const ig = list.find(
          (a) => mapZernioPlatform(a.platform || a.type || a.provider || a.channel) === "instagram"
        );
        const acc = ig || (list.length ? list[list.length - 1] : null);
        if (acc) {
          accountId = accountId || acc._id || acc.id || acc.accountId;
          displayUsername = displayUsername || acc.username || acc.name || acc.displayName || "Instagram";
        }
      }
      if (!accountId) {
        return res.redirect(`${base}/${successPage}?oauth_error=zernio_no_account`);
      }
      const zernioId = String(accountId);
      // Stable per (Zernio channel, business profile): reconnecting the same
      // channel into the same profile overwrites, while the same channel can
      // still be linked to other profiles as separate entries.
      const storeId = deterministicAccountId("zernio", `${zernioId}:${pending.profileId || ""}`);
      await tokenStore.set(storeId, {
        platform: "instagram",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        zernioAccountId: zernioId,
        username: displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram",
        instagramViaZernio: true,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "instagram",
        keepAccountId: storeId,
        matchers: [{ key: "zernioAccountId", value: zernioId }],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const usernameParam = encodeURIComponent(
        displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram"
      );
      res.redirect(
        `${base}/${successPage}?oauth_success=1&platform=instagram&account_id=${storeId}&username=${usernameParam}&zernio_account_id=${encodeURIComponent(
          zernioId
        )}${profileQuery}`
      );
    } catch (err) {
      console.error("[Zernio] Instagram callback error:", err);
      res.redirect(`${base}/${successPage}?oauth_error=token_exchange_failed`);
    }
  }

  app.get("/api/auth/zernio/instagram/callback", handleZernioInstagramCallback);
  app.get("/api/auth/late/instagram/callback", handleZernioInstagramCallback);

  const zernioConnectPlatformMap = {
    facebook: { slugs: ["facebook"], appPlatform: "facebook" },
    whatsapp: { slugs: ["whatsapp"], appPlatform: "whatsapp" },
    meta_business: {
      slugs: [
        "meta-business",
        "meta_business",
        "meta",
        "meta-ads",
        "facebook-business",
        "facebook-ads",
        "facebook",
      ],
      appPlatform: "meta_business",
    },
  };
  const googleAdsZernioConfig = {
    slugs: ["google-ads", "google_ads", "googleads"],
    appPlatform: "google_ads",
  };

  async function startZernioOAuthPlatform(req, res, routePlatform, config, hubReturn, userId) {
      // Capture the origin the user came from so the callback returns them to
      // it (a hardcoded BASE_URL on a different trusted origin logs them out).
      const appBaseUrl = requestedAppBaseUrl(req);
      const base = appBaseUrl || BASE_URL;
      const zernioKey = getZernioApiKey();
      if (!zernioKey) {
        return res.redirect(
          oauthRedirectTo(base, config.appPlatform, "oauth_error=zernio_not_configured", hubReturn || undefined)
        );
      }
      try {
        const zernioProfileId = await getOptionalZernioProfileId(
          config.appPlatform,
          requestBusinessProfileId(req)
        );
        const state = generateState();
        const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
        await oauthPendingStore.set(state, {
          platform: config.appPlatform,
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          appBaseUrl,
          createdAt: Date.now(),
          oauthReturnPage: hubReturn || undefined,
        });
        const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
        const authUrl = await getZernioConnectUrl({
          ZERNIO_API_BASE,
          zernioKey,
          platformSlugs: config.slugs,
          profileId: zernioProfileId,
          redirectUrl,
          extraParams: config.extraParams,
        });
        return res.redirect(authUrl);
      } catch (e) {
        const msg = String(e?.message || "");
        const hint = String((e as { hint?: string })?.hint || "");
        console.error(`[Zernio ${routePlatform}] connect init failed:`, msg, hint.slice(0, 120));
        if (`${msg} ${hint}`.includes("Platform not supported")) {
          return res.redirect(
            oauthRedirectTo(
              base,
              config.appPlatform,
              routePlatform === "google_business"
                ? "oauth_error=zernio_gmb_not_supported"
                : "oauth_error=zernio_platform_not_supported",
              hubReturn || undefined
            )
          );
        }
        // ZernioConnectError carries code + the upstream reason — surface both.
        return res.redirect(
          oauthRedirectTo(base, config.appPlatform, zernioOauthErrorQuery(e), hubReturn || undefined)
        );
      }
  }

  function registerZernioOAuthPlatformRoute(routePlatform) {
    const config = zernioConnectPlatformMap[routePlatform];
    if (!config) return;

    app.get(`/api/auth/${routePlatform}`, async (req, res) => {
      const hubReturn = parseOauthReturnPage(req);
      const userId = requireSessionOrRedirect(
        req,
        res,
        hubReturn || oauthPageForPlatform(config.appPlatform)
      );
      if (!userId) return;
      return startZernioOAuthPlatform(req, res, routePlatform, config, hubReturn, userId);
    });
  }

  app.get("/api/auth/google_ads", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    const requestedProvider = String(req.query.provider || "official").trim().toLowerCase();
    if (requestedProvider === "zernio") {
      return startZernioOAuthPlatform(
        req,
        res,
        "google_ads",
        googleAdsZernioConfig,
        hubReturn,
        userId
      );
    }
    return startOfficialGoogleAdsOAuth(req, res, userId, hubReturn);
  });

  app.get("/api/auth/google_ads/official", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    return startOfficialGoogleAdsOAuth(req, res, userId, hubReturn);
  });

  app.get("/api/auth/meta_business", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    const requestedProvider = String(req.query.provider || "official").trim().toLowerCase();
    if (requestedProvider === "zernio") {
      return startZernioOAuthPlatform(
        req,
        res,
        "meta_business",
        zernioConnectPlatformMap.meta_business,
        hubReturn,
        userId
      );
    }
    return startOfficialMetaBusinessOAuth(req, res, userId, hubReturn);
  });

  app.get("/api/auth/meta_business/official", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    return startOfficialMetaBusinessOAuth(req, res, userId, hubReturn);
  });

  registerZernioOAuthPlatformRoute("facebook");
  registerZernioOAuthPlatformRoute("whatsapp");

  app.get("/api/auth/google_ads/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_ads",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_ads"),
          pending?.oauthReturnPage
        )
      );
    }

    if (!pending || pending.platform !== "google_ads") {
      return res.redirect(oauthRedirectTo(base, "google_ads","oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=invalid_state", pending?.oauthReturnPage)
      );
    }
    await oauthPendingStore.delete(state);

    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=google_ads_not_configured", pending?.oauthReturnPage)
      );
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google_ads/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_ads",
            `oauth_error=${encodeURIComponent(String(rawErr))}`,
            pending?.oauthReturnPage
          )
        );
      }

      let username = "Google Ads";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = String(meData.email);

      const identityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gads", identityRaw, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "google_ads",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        scopes: GOOGLE_ADS_SCOPES,
        isOfficial: true,
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, "google_ads");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${successPath}?oauth_success=1&platform=google_ads&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Ads OAuth error:", err);
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });

  app.get("/api/auth/meta_business/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "meta_business",
          buildOAuthCallbackErrorQuery(error, errorDescription, "meta_business"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending || pending.platform !== "meta_business") {
      return res.redirect(oauthRedirectTo(base, "meta_business","oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=invalid_state", pending?.oauthReturnPage)
      );
    }
    await oauthPendingStore.delete(state);

    const appId = getMetaAppId();
    const appSecret = getMetaAppSecret();
    if (!appId || !appSecret) {
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=meta_business_not_configured", pending?.oauthReturnPage)
      );
    }

    try {
      const graphVersion = getMetaGraphVersion();
      const redirectUri = oauthCallbackUrl(req, "/api/auth/meta_business/callback");
      const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("code", String(code || ""));

      const tokenRes = await fetch(tokenUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        const rawErr =
          tokenData?.error?.message ||
          tokenData?.error_description ||
          tokenData?.error ||
          "token_exchange_failed";
        return res.redirect(
          oauthRedirectTo(
            base,
            "meta_business",
            `oauth_error=${encodeURIComponent(String(rawErr))}`,
            pending?.oauthReturnPage
          )
        );
      }

      const accessToken = String(tokenData.access_token);
      const graphBase = `https://graph.facebook.com/${graphVersion}`;
      const meRes = await fetch(
        `${graphBase}/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
      );
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || meData.error) {
        const rawErr = meData?.error?.message || "meta_profile_failed";
        return res.redirect(
          oauthRedirectTo(
            base,
            "meta_business",
            `oauth_error=${encodeURIComponent(String(rawErr))}`,
            pending?.oauthReturnPage
          )
        );
      }

      const [businessesRes, adAccountsRes] = await Promise.allSettled([
        fetch(
          `${graphBase}/me/businesses?fields=id,name,verification_status&limit=25&access_token=${encodeURIComponent(
            accessToken
          )}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
        ),
        fetch(
          `${graphBase}/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name&limit=25&access_token=${encodeURIComponent(
            accessToken
          )}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
        ),
      ]);
      const businesses =
        businessesRes.status === "fulfilled"
          ? await businessesRes.value.json().catch(() => ({}))
          : {};
      const adAccounts =
        adAccountsRes.status === "fulfilled"
          ? await adAccountsRes.value.json().catch(() => ({}))
          : {};
      const firstBusiness = Array.isArray(businesses?.data) ? businesses.data[0] : null;
      const firstAdAccount = Array.isArray(adAccounts?.data) ? adAccounts.data[0] : null;
      const displayName = String(
        firstBusiness?.name ||
        firstAdAccount?.name ||
        meData.name ||
        meData.email ||
        "Meta Business"
      );
      const identityRaw = String(meData.id || meData.email || displayName || "").toLowerCase();
      const accountId = profileScopedAccountId("meta", identityRaw, pending.profileId);

      await tokenStore.set(accountId, {
        platform: "meta_business",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: displayName,
        accessToken,
        tokenType: tokenData.token_type || "bearer",
        expiresIn: tokenData.expires_in || null,
        scopes: getMetaBusinessScopes(),
        isOfficial: true,
        metaUserId: meData.id || null,
        metaBusinessId: firstBusiness?.id || null,
        metaAdAccountId: firstAdAccount?.id || null,
        metaBusinesses: Array.isArray(businesses?.data) ? businesses.data : [],
        metaAdAccounts: Array.isArray(adAccounts?.data) ? adAccounts.data : [],
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, "meta_business");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${successPath}?oauth_success=1&platform=meta_business&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(displayName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Meta Business OAuth error:", err);
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });

  app.get("/api/auth/zernio/platform/callback", async (req, res) => {
    const {
      state,
      error,
      accountId: queryAccountId,
      username: queryUsername,
      connect_token: queryConnectToken,
      connectToken: queryConnectTokenCamel,
    } = req.query;
    if (error) {
      const pendingForError = state ? await oauthPendingStore.get(String(state)) : null;
      const platformForError = pendingForError?.platform || "facebook";
      return res.redirect(
        oauthRedirectTo(
          postOauthBaseUrl(pendingForError),
          platformForError,
          `oauth_error=${encodeURIComponent(error)}`,
          pendingForError?.oauthReturnPage
        )
      );
    }
    let resolvedState = state ? String(state) : "";
    let pending = await oauthPendingStore.get(resolvedState);
    const callbackUserId = getSessionUserId(req);
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    // Some Zernio provider flows may drop/replace query params on redirect.
    // Recover by using the most recent pending Zernio state for the same user.
    if (!pending) {
      const candidates = await oauthPendingStore.listZernioRecentForUser(callbackUserIdStr);
      if (candidates.length === 1) {
        [resolvedState, pending] = candidates[0];
      }
    }
    if (!pending) {
      return res.redirect(oauthRedirect("facebook", "oauth_error=invalid_state"));
    }
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      await oauthPendingStore.delete(resolvedState);
      return res.redirect(
        oauthRedirectTo(
          postOauthBaseUrl(pending),
          pending?.platform || "facebook",
          "oauth_error=invalid_state",
          pending?.oauthReturnPage
        )
      );
    }
    await oauthPendingStore.delete(resolvedState);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(
        oauthRedirectTo(
          postOauthBaseUrl(pending),
          pending?.platform || "facebook",
          "oauth_error=zernio_not_configured",
          pending?.oauthReturnPage
        )
      );
    }

    try {
      const connectToken =
        String(queryConnectToken || queryConnectTokenCamel || "").trim() || null;
      if (pending.platform === "google_business" && connectToken) {
        await resolveAndSelectGoogleBusinessLocation({
          ZERNIO_API_BASE,
          apiKey,
          connectToken,
        });
      }

      const { accountId, username, rawPlatform } = await resolveZernioAccountAfterCallback({
        zernio,
        mapZernioPlatform,
        desiredPlatform: pending.platform,
        queryAccountId,
        queryUsername,
      });

      const zernioAccountId = String(accountId);
      // Stable per (Zernio channel, business profile): reconnecting the same
      // channel into the same profile overwrites, while the same channel can
      // still be linked to other profiles as separate entries.
      const appAccountId = deterministicAccountId(
        "zernio",
        `${zernioAccountId}:${pending.profileId || ""}`
      );
      const safeUsername = String(username || pending.platform || "account").replace(/^@/, "");

      await tokenStore.set(appAccountId, {
        platform: pending.platform,
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: null,
        isZernio: true,
        zernioAccountId,
        zernioPlatform: rawPlatform || pending.platform,
        username: safeUsername,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: pending.platform,
        keepAccountId: appAccountId,
        matchers: [{ key: "zernioAccountId", value: zernioAccountId }],
        sameProfileId: pending.profileId || null,
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, pending.platform);
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${successPath}?oauth_success=1&platform=${encodeURIComponent(
          pending.platform
        )}&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(
          safeUsername
        )}&zernio_account_id=${encodeURIComponent(zernioAccountId)}${profileQuery}`
      );
    } catch (e) {
      const base = postOauthBaseUrl(pending);
      const msg = String(e?.message || "");
      if (msg === "zernio_fetch_accounts_failed") {
        return res.redirect(
          oauthRedirectTo(
            base,
            pending?.platform || "facebook",
            "oauth_error=zernio_fetch_accounts_failed",
            pending?.oauthReturnPage
          )
        );
      }
      if (msg === "zernio_no_account") {
        return res.redirect(
          oauthRedirectTo(base, pending?.platform || "facebook", "oauth_error=zernio_no_account", pending?.oauthReturnPage)
        );
      }
      if (
        msg === "zernio_gmb_no_locations" ||
        msg === "zernio_gmb_no_location_id" ||
        msg === "zernio_gmb_select_failed"
      ) {
        return res.redirect(
          oauthRedirectTo(
            base,
            pending?.platform || "facebook",
            "oauth_error=zernio_gmb_selection_failed",
            pending?.oauthReturnPage
          )
        );
      }
      return res.redirect(
        oauthRedirectTo(base, pending?.platform || "facebook", "oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });

  app.get("/api/auth/instagram/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pendingMeta = state ? await oauthPendingStore.get(state) : null;
    const igPage = postOauthPage(pendingMeta, "instagram");
    const base = postOauthBaseUrl(pendingMeta);
    if (error) {
      return res.redirect(`${base}/${igPage}?oauth_error=${error}`);
    }
    const pending = pendingMeta;
    if (!pending) {
      return res.redirect(`${base}/${igPage}?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(`${base}/${postOauthPage(pending, "instagram")}?oauth_error=invalid_state`);
    }
    const igSuccessPage = postOauthPage(pending, "instagram");
    await oauthPendingStore.delete(state);

    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${base}/${igSuccessPage}?oauth_error=instagram_not_configured`);
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/instagram/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: String(code || ""),
      });
      const tokenRes = await fetch(IG_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_message || data.error_description || data.error || "token_exchange_failed";
        return res.redirect(`${base}/${igSuccessPage}?oauth_error=${encodeURIComponent(String(rawErr))}`);
      }
      const username = data.user?.username || `user_${data.user_id}`;
      // Instagram returns a short-lived (~1h) token. Exchange it for a
      // long-lived (~60 day) token up front and store its expiry so the
      // account-data handler can refresh it before it dies. Fall back to the
      // short-lived token if the exchange fails (the handler still surfaces a
      // clean reconnect prompt in that case).
      const longLived = await exchangeForLongLivedInstagramToken(data.access_token, clientSecret);
      const igAccessToken = longLived?.accessToken || data.access_token;
      const igExpiresAt = longLived?.expiresAt || null;
      // Stable id per Instagram user: reconnecting overwrites instead of duplicating.
      const accountId = data.user_id
        ? profileScopedAccountId("ig", String(data.user_id), pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "instagram",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: igAccessToken,
        expiresAt: igExpiresAt,
        userId: data.user_id,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "instagram",
        keepAccountId: accountId,
        matchers: [
          { key: "userId", value: data.user_id ? String(data.user_id) : null },
          { key: "username", value: username },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${base}/${igSuccessPage}?oauth_success=1&platform=instagram&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Instagram OAuth error:", err);
      res.redirect(`${base}/${igSuccessPage}?oauth_error=token_exchange_failed`);
    }
  });

  // --- TikTok OAuth ---
  app.get("/api/auth/tiktok", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;

    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "auto").toLowerCase();
    const tryZernio = provider !== "official";
    const zernioKey = getZernioApiKey();
    let zernioAutoFailure: unknown = null;
    if (tryZernio && zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
        if (zernioProfileId) {
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "tiktok",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            appBaseUrl: requestedAppBaseUrl(req),
            createdAt: Date.now(),
            oauthReturnPage: parseOauthReturnPage(req) || undefined,
          });
          const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["tiktok"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        }
      } catch (e) {
        if (provider === "zernio") {
          return res.redirect(oauthRedirectTo(base, "tiktok",zernioOauthErrorQuery(e), returnPage));
        }
        // Fallback to official TikTok OAuth if Zernio connect is unavailable,
        // but keep the Zernio reason in case official isn't configured either.
        console.warn("[TikTok] Zernio connect unavailable, using official OAuth:", String(e?.message || e));
        zernioAutoFailure = e;
      }
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "tiktok",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=tiktok_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "tiktok",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/tiktok/callback");
    const url = new URL(TIKTOK_AUTH);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.list");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/tiktok/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "tiktok",
          buildOAuthCallbackErrorQuery(error, errorDescription, "tiktok"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=tiktok_not_configured", pending.oauthReturnPage));
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/tiktok/callback");
      const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(TIKTOK_TOKEN, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "tiktok",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      let username = data.open_id;
      try {
        const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=username,display_name", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15_000),
        });
        const userData = await userRes.json().catch(() => ({}));
        if (!userRes.ok) {
          console.warn("[TikTok] user info failed:", userRes.status, userData?.error || userData?.message || "");
        }
        if (userData.data?.user?.username) username = userData.data.user.username;
        else if (userData.data?.user?.display_name) username = userData.data.user.display_name;
      } catch (err) {
        console.warn("[TikTok] user info request failed:", err);
      }
      // Stable id per TikTok open_id: reconnecting overwrites instead of duplicating.
      const accountId = data.open_id
        ? profileScopedAccountId("tiktok", String(data.open_id), pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "tiktok",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        openId: data.open_id,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "tiktok",
        keepAccountId: accountId,
        matchers: [
          { key: "openId", value: data.open_id ? String(data.open_id) : null },
          { key: "username", value: username },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "tiktok");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=tiktok&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("TikTok OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- X (Twitter) OAuth 2.0 with PKCE ---
  app.get("/api/auth/x", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = process.env.X_CLIENT_ID;
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "x","oauth_error=x_not_configured", returnPage));
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    await oauthPendingStore.set(state, {
      platform: "x",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      codeVerifier,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/x/callback");
    const url = new URL(X_AUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", X_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    res.redirect(url.toString());
  });

  app.get("/api/auth/x/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "x",
          buildOAuthCallbackErrorQuery(error, errorDescription, "x"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) return res.redirect(oauthRedirectTo(base, "x","oauth_error=invalid_state"));
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "x","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId) return res.redirect(oauthRedirectTo(base, "x","oauth_error=x_not_configured", pending.oauthReturnPage));
    if (!pending.codeVerifier) {
      return res.redirect(oauthRedirectTo(base, "x","oauth_error=invalid_pkce_state", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/x/callback");
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code || ""),
        redirect_uri: redirectUri,
        code_verifier: pending.codeVerifier,
      });
      const headers = { "Content-Type": "application/x-www-form-urlencoded" };
      if (clientSecret) {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      } else {
        body.set("client_id", clientId);
      }
      const tokenRes = await fetchXToken(body, headers);
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        console.error("[X] token error:", tokenData.error, tokenData.error_description);
        return res.redirect(
          oauthRedirectTo(base, "x",`oauth_error=${encodeURIComponent(String(tokenData.error || "token_exchange_failed"))}`, pending.oauthReturnPage)
        );
      }
      const userRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(15_000) }
      );
      const userData = await userRes.json().catch(() => ({}));
      const user = userData.data || {};
      // Stable id per X user: reconnecting overwrites instead of duplicating.
      const accountId = user.id ? profileScopedAccountId("x", String(user.id), pending.profileId) : crypto.randomUUID();
      const username = user.username || user.name || accountId.slice(0, 8);
      await tokenStore.set(accountId, {
        platform: "x",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        xUserId: user.id,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "x",
        keepAccountId: accountId,
        matchers: [
          { key: "xUserId", value: user.id ? String(user.id) : null },
          { key: "username", value: user.username ? String(user.username) : null },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "x");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=x&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("[X] OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "x","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- YouTube (Google) OAuth ---
  app.get("/api/auth/youtube", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=youtube_not_configured", returnPage));
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "youtube",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/youtube/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", YOUTUBE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/youtube/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "youtube",
          buildOAuthCallbackErrorQuery(error, errorDescription, "youtube"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=youtube_not_configured", pending.oauthReturnPage));
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/youtube/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "youtube",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      // Hämta kanalinfo för username + stabil kanal-id
      let username = "YouTube-konto";
      const meRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.items?.[0]?.snippet?.title) {
        username = meData.items[0].snippet.title;
      }
      const channelId = meData.items?.[0]?.id ? String(meData.items[0].id) : "";
      // Stable id per YouTube channel: reconnecting overwrites instead of duplicating.
      const accountId = channelId ? profileScopedAccountId("yt", channelId, pending.profileId) : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "youtube",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        channelId: channelId || undefined,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "youtube",
        keepAccountId: accountId,
        matchers: [
          { key: "channelId", value: channelId },
          { key: "username", value: username !== "YouTube-konto" ? username : null },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "youtube");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=youtube&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("YouTube OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "youtube","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- Shopify OAuth (kräver shop-parameter: mittbutik.myshopify.com) ---
  // Shop handles: 3-60 chars, lowercase letters/digits/hyphens, cannot start or end with hyphen.
  function normalizeShopifyShop(raw: unknown): string | null {
    if (!raw) return null;
    const trimmed = String(raw).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!trimmed) return null;
    const handle = trimmed.replace(/\.myshopify\.com$/, "");
    if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(handle)) return null;
    return `${handle}.myshopify.com`;
  }
  const SHOPIFY_SCOPES = getShopifyScopes();
  app.get("/api/auth/shopify", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "ecommerce";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = process.env.SHOPIFY_API_KEY;
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_not_configured", returnPage));
    }
    const shop = normalizeShopifyShop(req.query.shop);
    if (!shop) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_invalid_shop", returnPage));
    }
    const shopifyPublicBase = getShopifyPublicBaseUrl();
    if (!shopifyPublicBase) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_public_url_missing", returnPage));
    }
    if (!/^https:\/\//i.test(shopifyPublicBase)) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_public_url_must_be_https", returnPage));
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "shopify",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      shop,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = `${shopifyPublicBase}/api/auth/shopify/callback`;
    const shopHandle = shop.replace(/\.myshopify\.com$/, "");
    const scopeDiagnostics = getShopifyScopeDiagnostics();
    if (scopeDiagnostics.removed.length > 0) {
      console.warn(
        "[shopify-oauth] Ignored invalid Customer Account scopes from SHOPIFY_EXTRA_SCOPES:",
        scopeDiagnostics.removed.join(", ")
      );
    }
    const url = `https://${shopHandle}.myshopify.com/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.redirect(url);
  });

  /**
   * Shopify-required callback authentication: every query param except
   * `hmac`/`signature`, sorted and joined, must HMAC-SHA256 to the `hmac`
   * param under the app secret. Complements the state check (CSRF) by
   * proving the callback actually came from Shopify.
   */
  function verifyShopifyCallbackHmac(query: Record<string, unknown>, secret: string): boolean {
    const provided = String(query?.hmac || "");
    if (!provided) return false;
    const message = Object.keys(query)
      .filter((key) => key !== "hmac" && key !== "signature")
      .sort()
      .map((key) => {
        const value = query[key];
        const flat = Array.isArray(value) ? value.join(",") : String(value ?? "");
        return `${key}=${flat}`;
      })
      .join("&");
    const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(provided.toLowerCase(), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  app.get("/api/auth/shopify/callback", async (req, res) => {
    const { code, state, shop, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "shopify",
          buildOAuthCallbackErrorQuery(error, errorDescription, "shopify"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    // Tunnel callbacks run on a different host than localhost, so callback cookies may be missing.
    // If callback user is present we still enforce strict owner match.
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_not_configured", pending.oauthReturnPage));
    }
    if (!verifyShopifyCallbackHmac(req.query as Record<string, unknown>, apiSecret)) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_hmac_invalid", pending.oauthReturnPage));
    }
    try {
      const shopUrl = normalizeShopifyShop(shop);
      const pendingShopUrl = normalizeShopifyShop(pending.shop);
      if (!shopUrl || !pendingShopUrl) {
        return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_invalid_shop", pending.oauthReturnPage));
      }
      if (shopUrl !== pendingShopUrl) {
        return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_shop_mismatch", pending.oauthReturnPage));
      }
      const tokenRes = await fetch(`https://${shopUrl}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code: String(code || ""),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        return res.redirect(
          oauthRedirectTo(
            base,
            "shopify",
            buildOAuthCallbackErrorQuery(data.error || "token_exchange_failed", data.error_description, "shopify"),
            pending.oauthReturnPage
          )
        );
      }
      const shopName = shopUrl.replace(/\.myshopify\.com$/, "");
      // Reuse a stable account id per shop so reconnects update the same record (matches Drive/Gmail pattern).
      const accountId = profileScopedAccountId("shopify", shopUrl, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "shopify",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: shopName,
        accessToken: data.access_token,
        shop: shopUrl,
        scope: data.scope || SHOPIFY_SCOPES,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "shopify");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=shopify&account_id=${accountId}&username=${encodeURIComponent(shopName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Shopify OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "shopify","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- Notion OAuth ---
  app.get("/api/auth/notion", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "ecommerce";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;

    const clientId = String(process.env.NOTION_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=notion_not_configured", returnPage));
    }

    const notionPublicBase = getNotionPublicBaseUrl();
    if (!/^https:\/\//i.test(notionPublicBase)) {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=notion_public_url_must_be_https", returnPage));
    }
    const redirectUri = `${notionPublicBase}/api/auth/notion/callback`;

    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "notion",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });

    const url = new URL(NOTION_AUTH);
    url.searchParams.set("owner", "user");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/notion/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "notion",
          buildOAuthCallbackErrorQuery(error, errorDescription, "notion"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending || pending.platform !== "notion") {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = String(process.env.NOTION_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.NOTION_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=notion_not_configured", pending.oauthReturnPage));
    }

    try {
      const notionPublicBase = getNotionPublicBaseUrl();
      const redirectUri = `${notionPublicBase}/api/auth/notion/callback`;
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(NOTION_TOKEN, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: String(code || ""),
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData?.access_token) {
        const rawErr = tokenData?.error || tokenData?.message || "token_exchange_failed";
        return res.redirect(
          oauthRedirectTo(base, "notion",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage)
        );
      }

      const workspaceId = String(tokenData.workspace_id || tokenData.bot_id || "").trim();
      // Stable id per Notion workspace: reconnecting overwrites instead of duplicating.
      const accountId = workspaceId
        ? profileScopedAccountId("notion", workspaceId, pending.profileId)
        : crypto.randomUUID();
      const workspaceName = String(tokenData.workspace_name || "Notion Workspace");

      await tokenStore.set(accountId, {
        platform: "notion",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        botId: tokenData.bot_id,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "notion",
        keepAccountId: accountId,
        matchers: [
          { key: "workspaceId", value: tokenData.workspace_id ? String(tokenData.workspace_id) : null },
          { key: "botId", value: tokenData.bot_id ? String(tokenData.bot_id) : null },
        ],
        sameProfileId: pending.profileId || null,
      });

      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "notion");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=notion&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(workspaceName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Notion OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "notion","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- Google Calendar OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/google_calendar", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "calendar";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    let zernioAutoFailure: unknown = null;

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
          if (!zernioProfileId) {
            return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=zernio_profile_failed", returnPage));
          }
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "google_calendar",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            appBaseUrl: requestedAppBaseUrl(req),
            createdAt: Date.now(),
            oauthReturnPage: parseOauthReturnPage(req) || undefined,
          });
          const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["google-calendar", "google_calendar", "google-workspace-calendar", "google-workspace"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "google_calendar",zernioOauthErrorQuery(e), returnPage));
          }
          // auto: remember WHY Zernio refused before falling back to official —
          // if official isn't configured the user must see the Zernio reason,
          // not a misleading "not configured".
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=zernio_not_configured", returnPage));
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_calendar",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=google_calendar_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "google_calendar",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google-calendar/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google-calendar/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_calendar",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_calendar"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=google_calendar_not_configured", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google-calendar/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "google_calendar",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      let username = "Google Calendar";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = meData.email;
      const identityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gcal", identityRaw, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "google_calendar",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // Clean up legacy random-id entries for the same calendar account.
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "google_calendar",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: meData.email ? String(meData.email) : null }],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_calendar");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=google_calendar&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Calendar OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- Outlook Calendar OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/outlook_calendar", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "calendar";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    let zernioAutoFailure: unknown = null;

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
          if (!zernioProfileId) {
            return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=zernio_profile_failed", returnPage));
          }
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "outlook_calendar",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            appBaseUrl: requestedAppBaseUrl(req),
            createdAt: Date.now(),
            oauthReturnPage: parseOauthReturnPage(req) || undefined,
          });
          const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["outlook-calendar", "outlook_calendar", "microsoft-calendar", "microsoft-outlook-calendar"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "outlook_calendar",zernioOauthErrorQuery(e), returnPage));
          }
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=zernio_not_configured", returnPage));
      }
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "outlook_calendar",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=outlook_calendar_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "outlook_calendar",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook-calendar/callback");
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(OUTLOOK_CALENDAR_SCOPES)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook-calendar/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "outlook_calendar",
          buildOAuthCallbackErrorQuery(error, errorDescription, "outlook_calendar"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=outlook_calendar_not_configured", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook-calendar/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "outlook_calendar",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      let username = "Outlook Calendar";
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.mail) username = meData.mail;
      else if (meData.userPrincipalName) username = meData.userPrincipalName;
      const msIdentity = String(meData.id || meData.userPrincipalName || meData.mail || "").trim();
      // Stable id per Microsoft user: reconnecting overwrites instead of duplicating.
      const accountId = msIdentity
        ? profileScopedAccountId("ocal", msIdentity, pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "outlook_calendar",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "outlook_calendar",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: username !== "Outlook Calendar" ? username : null }],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "outlook_calendar");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=outlook_calendar&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Outlook Calendar OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- Google Reviews OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/google_reviews", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "reviews";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    let zernioAutoFailure: unknown = null;

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOptionalZernioProfileId(
            "google_reviews",
            requestBusinessProfileId(req)
          );
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "google_reviews",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            appBaseUrl: requestedAppBaseUrl(req),
            createdAt: Date.now(),
            oauthReturnPage: parseOauthReturnPage(req) || undefined,
          });
          const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["google-reviews", "google_reviews", "google-business-reviews"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "google_reviews",zernioOauthErrorQuery(e), returnPage));
          }
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "google_reviews","oauth_error=zernio_not_configured", returnPage));
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_reviews",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=google_reviews_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "google_reviews",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google-reviews/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_REVIEWS_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google-reviews/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_reviews",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_reviews"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "google_reviews","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "google_reviews","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        oauthRedirectTo(base, "google_reviews","oauth_error=google_reviews_not_configured", pending.oauthReturnPage)
      );
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google-reviews/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_reviews",
            `oauth_error=${encodeURIComponent(String(tokenData.error || "token_exchange_failed"))}`,
            pending.oauthReturnPage
          )
        );
      }

      const headers = { Authorization: `Bearer ${tokenData.access_token}` };
      // Primary API: account management v1. Fallback: legacy v4 for tenants with partial migration.
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers, signal: AbortSignal.timeout(15_000) });
      const accountsBody = await accountsRes.json().catch(() => ({}));
      let accounts = Array.isArray(accountsBody.accounts) ? accountsBody.accounts : [];
      if ((!accounts || accounts.length === 0) && accountsRes.ok) {
        const legacyAccountsRes = await fetch("https://mybusiness.googleapis.com/v4/accounts", { headers, signal: AbortSignal.timeout(15_000) });
        const legacyAccountsBody = await legacyAccountsRes.json().catch(() => ({}));
        const legacyAccounts = Array.isArray(legacyAccountsBody.accounts) ? legacyAccountsBody.accounts : [];
        if (legacyAccounts.length > 0) {
          accounts = legacyAccounts;
        }
      }
      if (!accountsRes.ok && (!accounts || accounts.length === 0)) {
        const errHint = encodeURIComponent(String(accountsBody?.error?.message || accountsBody?.error || "accounts_api_failed"));
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_reviews",
            `oauth_error=google_reviews_accounts_api_failed&oauth_hint=${errHint}`,
            pending.oauthReturnPage
          )
        );
      }
      const firstAccount = accounts[0] || null;
      const accountNamePath = String(firstAccount?.name || "");
      const accountId = accountNamePath.split("/")[1] || "";
      if (!accountId) {
        return res.redirect(
          oauthRedirectTo(base, "google_reviews","oauth_error=google_reviews_no_account_access", pending.oauthReturnPage)
        );
      }

      const locationsRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountNamePath}/locations?pageSize=20&readMask=name,title`,
        { headers, signal: AbortSignal.timeout(15_000) }
      );
      const locationsBody = await locationsRes.json().catch(() => ({}));
      let locations = Array.isArray(locationsBody.locations) ? locationsBody.locations : [];
      if ((!locations || locations.length === 0) && locationsRes.ok) {
        const legacyLocationsRes = await fetch(
          `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations?pageSize=20`,
          { headers, signal: AbortSignal.timeout(15_000) }
        );
        const legacyLocationsBody = await legacyLocationsRes.json().catch(() => ({}));
        const legacyLocations = Array.isArray(legacyLocationsBody.locations) ? legacyLocationsBody.locations : [];
        if (legacyLocations.length > 0) {
          locations = legacyLocations;
        }
      }
      if (!locationsRes.ok && (!locations || locations.length === 0)) {
        const errHint = encodeURIComponent(String(locationsBody?.error?.message || locationsBody?.error || "locations_api_failed"));
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_reviews",
            `oauth_error=google_reviews_locations_api_failed&oauth_hint=${errHint}`,
            pending.oauthReturnPage
          )
        );
      }
      const firstLocation = locations[0] || null;
      const locationNamePath = String(firstLocation?.name || "");
      const locationId = locationNamePath.split("/").pop() || "";
      const locationTitle = String(firstLocation?.title || firstLocation?.locationName || firstLocation?.storeCode || "Google location");
      if (!locationId) {
        return res.redirect(
          oauthRedirectTo(base, "google_reviews","oauth_error=google_reviews_no_location_access", pending.oauthReturnPage)
        );
      }

      const appAccountId = profileScopedAccountId(
        "grev",
        `${accountId}:${locationId}`,
        pending.profileId
      );
      await tokenStore.set(appAccountId, {
        platform: "google_reviews",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: locationTitle,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        googleBusinessAccountId: accountId,
        googleBusinessLocationId: locationId,
        googleBusinessLocationName: locationTitle,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_reviews");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=google_reviews&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(locationTitle)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Reviews OAuth error:", err);
      return res.redirect(
        oauthRedirectTo(base, "google_reviews","oauth_error=token_exchange_failed", pending.oauthReturnPage)
      );
    }
  });

  // --- Google Business Profile (Official API) — same GBP scopes as Reviews; stored as platform google_business for Social ---
  app.get("/api/auth/google_business", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    res.set("Cache-Control", "no-store, no-cache");
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "official").trim().toLowerCase();
    if (provider === "zernio") {
      const zernioKey = getZernioApiKey();
      if (!zernioKey) {
        return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=zernio_not_configured", returnPage));
      }
      try {
        const zernioProfileId = await getOptionalZernioProfileId(
          "google_business",
          requestBusinessProfileId(req)
        );
        const state = generateState();
        const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
        await oauthPendingStore.set(state, {
          platform: "google_business",
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          appBaseUrl: requestedAppBaseUrl(req),
          createdAt: Date.now(),
          oauthReturnPage: returnPage,
        });
        const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
        const authUrl = await getZernioConnectUrl({
          ZERNIO_API_BASE,
          zernioKey,
          platformSlugs: ["google-business", "google-business-profile", "google-business-location", "google_business"],
          profileId: zernioProfileId,
          redirectUrl,
          extraParams: { headless: "true" },
        });
        return res.redirect(authUrl);
      } catch (e) {
        const msg = String(e?.message || "");
        const hint = String((e as { hint?: string })?.hint || "");
        console.error("[Zernio google_business] connect init failed:", msg, hint.slice(0, 120));
        if (`${msg} ${hint}`.includes("Platform not supported")) {
          return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=zernio_gmb_not_supported", returnPage));
        }
        return res.redirect(oauthRedirectTo(base, "google_business",zernioOauthErrorQuery(e), returnPage));
      }
    }
    // Default Google Business Profile path: official Google OAuth.
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_business",
          "oauth_error=google_business_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "google_business",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google_business/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_REVIEWS_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_business/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_business",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_business"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=google_business_not_configured", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google_business/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        return res.redirect(
          oauthRedirectTo(base, "google_business",`oauth_error=${encodeURIComponent(String(tokenData.error || "token_exchange_failed"))}`, pending.oauthReturnPage)
        );
      }

      const headers = { Authorization: `Bearer ${tokenData.access_token}` };
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers, signal: AbortSignal.timeout(15_000) });
      const accountsBody = await accountsRes.json().catch(() => ({}));
      let accounts = Array.isArray(accountsBody.accounts) ? accountsBody.accounts : [];
      if ((!accounts || accounts.length === 0) && accountsRes.ok) {
        const legacyAccountsRes = await fetch("https://mybusiness.googleapis.com/v4/accounts", { headers, signal: AbortSignal.timeout(15_000) });
        const legacyAccountsBody = await legacyAccountsRes.json().catch(() => ({}));
        const legacyAccounts = Array.isArray(legacyAccountsBody.accounts) ? legacyAccountsBody.accounts : [];
        if (legacyAccounts.length > 0) {
          accounts = legacyAccounts;
        }
      }
      if (!accountsRes.ok && (!accounts || accounts.length === 0)) {
        const errHint = encodeURIComponent(String(accountsBody?.error?.message || accountsBody?.error || "accounts_api_failed"));
        return res.redirect(
          oauthRedirectTo(base, "google_business",`oauth_error=google_business_accounts_api_failed&oauth_hint=${errHint}`, pending.oauthReturnPage)
        );
      }
      const firstAccount = accounts[0] || null;
      const accountNamePath = String(firstAccount?.name || "");
      const accountId = accountNamePath.split("/")[1] || "";
      if (!accountId) {
        return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=google_business_no_account_access", pending.oauthReturnPage));
      }

      const locationsRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountNamePath}/locations?pageSize=20&readMask=name,title`,
        { headers, signal: AbortSignal.timeout(15_000) }
      );
      const locationsBody = await locationsRes.json().catch(() => ({}));
      let locations = Array.isArray(locationsBody.locations) ? locationsBody.locations : [];
      if ((!locations || locations.length === 0) && locationsRes.ok) {
        const legacyLocationsRes = await fetch(
          `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations?pageSize=20`,
          { headers, signal: AbortSignal.timeout(15_000) }
        );
        const legacyLocationsBody = await legacyLocationsRes.json().catch(() => ({}));
        const legacyLocations = Array.isArray(legacyLocationsBody.locations) ? legacyLocationsBody.locations : [];
        if (legacyLocations.length > 0) {
          locations = legacyLocations;
        }
      }
      if (!locationsRes.ok && (!locations || locations.length === 0)) {
        const errHint = encodeURIComponent(String(locationsBody?.error?.message || locationsBody?.error || "locations_api_failed"));
        return res.redirect(
          oauthRedirectTo(base, "google_business",`oauth_error=google_business_locations_api_failed&oauth_hint=${errHint}`, pending.oauthReturnPage)
        );
      }
      const firstLocation = locations[0] || null;
      const locationNamePath = String(firstLocation?.name || "");
      const locationId = locationNamePath.split("/").pop() || "";
      const locationTitle = String(firstLocation?.title || firstLocation?.locationName || firstLocation?.storeCode || "Google location");
      if (!locationId) {
        return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=google_business_no_location_access", pending.oauthReturnPage));
      }

      const appAccountId = profileScopedAccountId(
        "gbp",
        `${accountId}:${locationId}`,
        pending.profileId
      );
      await tokenStore.set(appAccountId, {
        platform: "google_business",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: locationTitle,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        googleBusinessAccountId: accountId,
        googleBusinessLocationId: locationId,
        googleBusinessLocationName: locationTitle,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_business");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=google_business&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(locationTitle)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Business OAuth error:", err);
      return res.redirect(oauthRedirectTo(base, "google_business","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });

  // --- Tripadvisor connect (Zernio + official API key fallback) ---
  app.get("/api/auth/tripadvisor", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "reviews";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    // Synchronous (env-key) connect resolves on this same request, so return
    // the user to the origin they came from rather than a hardcoded BASE_URL.
    const base = requestedAppBaseUrl(req) || BASE_URL;
    let zernioAutoFailure: unknown = null;

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOptionalZernioProfileId(
            "tripadvisor",
            requestBusinessProfileId(req)
          );
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "tripadvisor",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            appBaseUrl: requestedAppBaseUrl(req),
            createdAt: Date.now(),
            oauthReturnPage: parseOauthReturnPage(req) || undefined,
          });
          const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["tripadvisor", "trip-advisor"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "tripadvisor", zernioOauthErrorQuery(e), returnPage));
          }
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "tripadvisor", "oauth_error=zernio_not_configured", returnPage));
      }
    }

    const tripadvisorBp = requestBusinessProfileId(req);
    const apiKey = String((await secretResolver.resolve(tripadvisorBp, "TRIPADVISOR_API_KEY")) || "").trim();
    const locationId = String(
      req.query.location_id || (await secretResolver.resolve(tripadvisorBp, "TRIPADVISOR_LOCATION_ID")) || ""
    ).trim();
    if (!apiKey || !locationId) {
      if (zernioAutoFailure) {
        return res.redirect(oauthRedirectTo(base, "tripadvisor", zernioOauthErrorQuery(zernioAutoFailure), returnPage));
      }
      const missing = [
        !apiKey ? "TRIPADVISOR_API_KEY" : "",
        !locationId ? "TRIPADVISOR_LOCATION_ID" : "",
      ].filter(Boolean);
      return res.redirect(
        oauthRedirectTo(
          base,
          "tripadvisor",
          `oauth_error=tripadvisor_not_configured&oauth_hint=${encodeURIComponent(
          `Missing ${missing.join(" and ")}. Add them in .env.local or Preferences -> API keys, or use the sidebar manual connect form.`
          )}`,
          returnPage
        )
      );
    }
    // Stable id per Tripadvisor location: reconnecting overwrites instead of duplicating.
    const accountId = profileScopedAccountId("ta", locationId, ourProfileId);
    await tokenStore.set(accountId, {
      platform: "tripadvisor",
      ownerUserId: userId,
      profileId: ourProfileId,
      username: `Tripadvisor ${locationId}`,
      accessToken: null,
      tripadvisorApiKey: apiKey,
      tripadvisorLocationId: locationId,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform: "tripadvisor",
      keepAccountId: accountId,
      matchers: [{ key: "tripadvisorLocationId", value: locationId }],
      sameProfileId: ourProfileId || null,
    });
    const profileQuery = profileParam(ourProfileId);
    const postPage = returnPage === "connections" ? "connections" : "reviews";
    return res.redirect(
      `${base}/${postPage}?oauth_success=1&platform=tripadvisor&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(`Tripadvisor ${locationId}`)}${profileQuery}`
    );
  });

  app.post("/api/auth/tripadvisor/manual-connect", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const locationId = String(req.body?.locationId || "").trim();
    const providedApiKey = String(req.body?.apiKey || "").trim();
    const profileId = String(req.body?.profileId || "").trim() || null;
    const apiKey =
      providedApiKey ||
      String((await secretResolver.resolve(requestBusinessProfileId(req), "TRIPADVISOR_API_KEY")) || "").trim();
    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }
    if (!apiKey) {
      return res.status(400).json({ error: "Tripadvisor API key is required" });
    }
    // Stable id per Tripadvisor location: reconnecting overwrites instead of duplicating.
    const accountId = profileScopedAccountId("ta", locationId, profileId);
    await tokenStore.set(accountId, {
      platform: "tripadvisor",
      ownerUserId: userId,
      profileId,
      username: `Tripadvisor ${locationId}`,
      accessToken: null,
      tripadvisorApiKey: apiKey,
      tripadvisorLocationId: locationId,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform: "tripadvisor",
      keepAccountId: accountId,
      matchers: [{ key: "tripadvisorLocationId", value: locationId }],
      sameProfileId: profileId || null,
    });
    return res.json({
      ok: true,
      account_id: accountId,
      platform: "tripadvisor",
      username: `Tripadvisor ${locationId}`,
      ...(profileId ? { profile_id: profileId } : {}),
    });
  });

  // --- Gmail OAuth (samma Google OAuth, andra scopes) ---
  app.get("/api/auth/gmail", async (req, res) => {
    const appBaseUrl = requestedAppBaseUrl(req);
    const returnPage = parseOauthReturnPage(req) || "messages";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    debugLog("pre-fix", "H1", "oauthRoutes.js:/api/auth/gmail", "Gmail OAuth init hit", {
      hasUserId: Boolean(userId),
      profileIdPresent: Boolean(normalizeRequestedProfileId(req.query.profile_id)),
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, buildOauthErrorParams("gmail_not_configured", {
          status: 500,
          exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
        }))
      );
    }
    const state = generateState();
    const redirectUri = getGmailRedirectUri(req);
    await oauthPendingStore.set(state, {
      platform: "gmail",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      redirectUri,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GMAIL_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_drive", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "content";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      const params = buildOauthErrorParams("google_drive_not_configured", {
        status: 500,
        exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
      });
      if (req.query.popup === "1") {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          }),
          buildContentUrl(BASE_URL, params),
          BASE_URL
        );
      }
      return res.redirect(buildPageUrlWithBase(requestedAppBaseUrl(req) || BASE_URL, returnPage, params));
    }
    const state = generateState();
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google_drive/callback");
    await oauthPendingStore.set(state, {
      platform: "google_drive",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      popup: req.query.popup === "1",
      appBaseUrl: requestedAppBaseUrl(req),
      redirectUri,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_drive/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    const returnBase = postOauthBaseUrl(pending);
    if (error) {
      const errorCode = String(error);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload(errorCode),
          buildContentUrl(returnBase, buildOauthErrorParams(errorCode)),
          returnBase
        );
      }
      return res.redirect(buildPageUrlWithBase(returnBase, postOauthPage(pending, "google_drive"), buildOauthErrorParams(errorCode)));
    }
    if (!pending) {
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          oauthPageForPlatform("google_drive"),
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state was missing or expired.",
          })
        )
      );
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          }),
          buildContentUrl(
            returnBase,
            buildOauthErrorParams("invalid_state", {
              status: 400,
              exception: "OAuth state did not match the active session.",
            })
          ),
          returnBase
        );
      }
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          postOauthPage(pending, "google_drive"),
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          })
        )
      );
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          }),
          buildContentUrl(
            returnBase,
            buildOauthErrorParams("google_drive_not_configured", {
              status: 500,
              exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
            })
          ),
          returnBase
        );
      }
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          postOauthPage(pending, "google_drive"),
          buildOauthErrorParams("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          })
        )
      );
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google_drive/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const errorCode = String(data.error_description || data.error || "token_exchange_failed");
        if (pending?.popup) {
          return sendPopupOAuthResult(
            res,
            buildPopupOauthErrorPayload(errorCode, {
              status: tokenRes.status,
              exception: data.error_description || data.error || "Google token exchange failed.",
            }),
            buildContentUrl(
              returnBase,
              buildOauthErrorParams(errorCode, {
                status: tokenRes.status,
                exception: data.error_description || data.error || "Google token exchange failed.",
              })
            ),
            returnBase
          );
        }
        return res.redirect(
          buildPageUrlWithBase(
            returnBase,
            postOauthPage(pending, "google_drive"),
            buildOauthErrorParams(errorCode, {
              status: tokenRes.status,
              exception: data.error_description || data.error || "Google token exchange failed.",
            })
          )
        );
      }

      let username = "Google Drive";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = String(meData.email);
      const driveIdentityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gdrive", driveIdentityRaw, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "google_drive",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // Clean up legacy random-id entries for the same Drive account.
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "google_drive",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: meData.email ? String(meData.email) : null }],
        sameProfileId: pending.profileId || null,
      });
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          {
            type: "google_drive_oauth",
            success: true,
            platform: "google_drive",
            account_id: accountId,
            username,
            ...(pending.profileId ? { profile_id: pending.profileId } : {}),
          },
          buildContentUrl(returnBase, {
            oauth_success: 1,
            platform: "google_drive",
            account_id: accountId,
            username,
            profile_id: pending.profileId,
          }),
          returnBase
        );
      }
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_drive");
      return res.redirect(
        `${returnBase}/${postPage}?oauth_success=1&platform=google_drive&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Drive OAuth error:", err);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          }),
          buildContentUrl(
            returnBase,
            buildOauthErrorParams("token_exchange_failed", {
              status: 500,
              exception: getExceptionMessage(err),
            })
          ),
          returnBase
        );
      }
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          postOauthPage(pending, "google_drive"),
          buildOauthErrorParams("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          })
        )
      );
    }
  });

  async function handleGmailCallback(req, res) {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Gmail callback received", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      error: error ? String(error) : null,
    });
    if (error) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: String(error) }));
    }
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Pending state lookup", {
      pendingFound: Boolean(pending),
      pendingPlatform: pending?.platform ?? null,
    });
    if (!pending) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Callback user/session validation", {
      callbackUserIdPrefix: callbackUserIdStr ? callbackUserIdStr.slice(0, 14) : null,
      pendingUserIdPrefix: pendingUserId ? pendingUserId.slice(0, 14) : null,
      matches: Boolean(callbackUserIdStr && pendingUserId && callbackUserIdStr === pendingUserId),
      isLocalToCloudTransition,
    });
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    if (isLocalToCloudTransition) {
      debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Allowing local-to-cloud transition", {
        callbackUserIdPrefix: callbackUserIdStr.slice(0, 14),
        pendingUserIdPrefix: pendingUserId.slice(0, 14),
      });
    }
    if (!callbackUserId) {
      debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Proceeding without callback cookie session", {
        fallbackToPendingUserIdPrefix: pending?.userId ? String(pending.userId).slice(0, 14) : null,
      });
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPendingMessagesUrl(pending, buildOauthErrorParams("gmail_not_configured", {
          status: 500,
          exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
        }))
      );
    }
    try {
      const redirectUri = typeof pending.redirectUri === "string" ? pending.redirectUri : getGmailRedirectUri(req);
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      debugLog("pre-fix", "H3", "oauthRoutes.js:/api/auth/gmail/callback", "Google token exchange response", {
        status: tokenRes.status,
        ok: tokenRes.ok,
        hasAccessToken: Boolean(data.access_token),
        hasRefreshToken: Boolean(data.refresh_token),
        tokenError: data.error ?? null,
      });
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(
          buildPendingMessagesUrl(pending, buildOauthErrorParams(String(rawErr), {
            status: tokenRes.status,
            exception: data.error_description || data.error || "Google token exchange failed.",
          }))
        );
      }
      let username = "Gmail";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = meData.email;
      const gmailIdentityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gmail", gmailIdentityRaw, pending.profileId);
      debugLog("pre-fix", "H3", "oauthRoutes.js:/api/auth/gmail/callback", "Resolved stable Gmail account id", {
        hasGoogleUserId: Boolean(meData.id),
        hasEmail: Boolean(meData.email),
        accountId,
      });
      await tokenStore.set(accountId, {
        platform: "gmail",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // Clean up legacy random-id entries for the same mailbox.
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "gmail",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: meData.email ? String(meData.email) : null }],
        sameProfileId: pending.profileId || null,
      });
      const postPage = postOauthPage(pending, "gmail");
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), postPage, {
          oauth_success: 1,
          platform: "gmail",
          account_id: accountId,
          username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error("Gmail OAuth error:", err);
      res.redirect(
        buildPendingMessagesUrl(pending, buildOauthErrorParams("token_exchange_failed", {
          status: 500,
          exception: getExceptionMessage(err),
        }))
      );
    }
  }

  app.get("/api/auth/gmail/callback", handleGmailCallback);
  app.get("/api/auth/google/callback", handleGmailCallback);

  // --- Outlook OAuth (Microsoft) ---
  app.get("/api/auth/outlook", async (req, res) => {
    const appBaseUrl = requestedAppBaseUrl(req);
    const returnPage = parseOauthReturnPage(req) || "messages";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, { oauth_error: "outlook_not_configured" })
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "outlook",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook/callback");
    const scope = "offline_access openid profile email User.Read Mail.ReadWrite Mail.Send";
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    if (error) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: String(error) }));
    }
    if (!pending) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "outlook_not_configured" }));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: String(rawErr) }));
      }
      let username = "Outlook";
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.mail) username = meData.mail;
      else if (meData.userPrincipalName) username = meData.userPrincipalName;
      const msIdentity = String(meData.id || meData.userPrincipalName || meData.mail || "").trim();
      // Stable id per Microsoft user: reconnecting overwrites instead of duplicating.
      const accountId = msIdentity
        ? profileScopedAccountId("outlook", msIdentity, pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "outlook",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "outlook",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: username !== "Outlook" ? username : null }],
        sameProfileId: pending.profileId || null,
      });
      const postPage = postOauthPage(pending, "outlook");
      res.redirect(
        buildPageUrlWithBase(pending.appBaseUrl || BASE_URL, postPage, {
          oauth_success: 1,
          platform: "outlook",
          account_id: accountId,
          username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error("Outlook OAuth error:", err);
      res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "token_exchange_failed" }));
    }
  });

  // --- Canva Connect OAuth ---
  app.get("/api/auth/canva", async (req, res) => {
    const appBaseUrl = requestedAppBaseUrl(req);
    const returnPage = parseOauthReturnPage(req) || "content";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;

    const clientId = getCanvaClientId();
    const clientSecret = getCanvaClientSecret();
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, buildOauthErrorParams("canva_not_configured", {
          status: 500,
          exception: "CANVA_CLIENT_ID or CANVA_CLIENT_SECRET is missing.",
        }))
      );
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const redirectUri = getCanvaRedirectUri(req);
    await oauthPendingStore.set(state, {
      platform: "canva",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      redirectUri,
      codeVerifier,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });

    const url = new URL(CANVA_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", canvaScope());
    url.searchParams.set("code_challenge", generateCodeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/canva/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    const fallbackPage = postOauthPage(pending, "canva");
    if (error) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams(String(error)))
      );
    }
    if (!pending || pending.platform !== "canva") {
      return res.redirect(
        buildPageUrlWithBase(BASE_URL, oauthPageForPlatform("canva"), buildOauthErrorParams("invalid_state", {
          status: 400,
          exception: "OAuth state was missing or expired.",
        }))
      );
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("invalid_state", {
          status: 400,
          exception: "OAuth state did not match the active session.",
        }))
      );
    }
    await oauthPendingStore.delete(state);
    if (!code) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("missing_code"))
      );
    }

    const clientId = getCanvaClientId();
    const clientSecret = getCanvaClientSecret();
    if (!clientId || !clientSecret || !pending.codeVerifier) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("canva_not_configured", {
          status: 500,
          exception: "CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, or PKCE verifier is missing.",
        }))
      );
    }

    try {
      const tokenResult = await exchangeCanvaOAuthCode({
        clientId,
        clientSecret,
        code: String(code),
        codeVerifier: String(pending.codeVerifier),
        redirectUri: typeof pending.redirectUri === "string" ? pending.redirectUri : getCanvaRedirectUri(req),
      });
      if (tokenResult.ok === false) {
        return res.redirect(
          buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("token_exchange_failed", {
            status: tokenResult.status,
            exception: tokenResult.message,
          }))
        );
      }

      const identity = await fetchCanvaUserIdentity(tokenResult.accessToken).catch(() => ({
        id: null,
        username: "Canva",
      }));
      const externalIdentity = String(identity.id || identity.username || "canva").toLowerCase();
      const accountId = profileScopedAccountId("canva", externalIdentity, pending.profileId);
      const expiresAt = tokenResult.expiresIn
        ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
        : undefined;

      await tokenStore.set(accountId, {
        platform: "canva",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: identity.username,
        displayName: identity.username,
        profileUrl: "https://www.canva.com",
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt,
        scope: tokenResult.scope || canvaScope(),
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "canva",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: identity.username }],
        sameProfileId: pending.profileId || null,
      });

      const postPage = postOauthPage(pending, "canva");
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), postPage, {
          oauth_success: 1,
          platform: "canva",
          account_id: accountId,
          username: identity.username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error("Canva OAuth error:", err);
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("token_exchange_failed", {
          status: 500,
          exception: getExceptionMessage(err),
        }))
      );
    }
  });

  // --- OAuth-secured remote MCP servers (Day.ai, Windsor.ai, …) ---
  //
  // One generic init/callback pair driven by OAUTH_MCP_DIRECTORY. These
  // providers implement MCP-spec authorization: authorization_code + PKCE
  // with dynamic client registration, so no pre-provisioned client id is
  // needed — we self-register per redirect URI and persist the credentials
  // in the token store under a reserved platform key.

  function mcpOauthClientRecordId(platform: string): string {
    return `mcp_oauth_client:${platform}`;
  }

  function getMcpOauthEnvClient(envPrefix: string): { clientId: string; clientSecret: string } | null {
    const clientId = String(process.env[`${envPrefix}_CLIENT_ID`] || "").trim();
    const clientSecret = String(process.env[`${envPrefix}_CLIENT_SECRET`] || "").trim();
    if (clientId && clientSecret) return { clientId, clientSecret };
    return null;
  }

  /**
   * Resolve OAuth client credentials for an MCP provider: env override →
   * previously registered client (same redirect URI) → dynamic registration.
   */
  async function getMcpOauthClient(
    platform: string,
    redirectUri: string
  ): Promise<{ clientId: string; clientSecret: string } | { error: string; status: number }> {
    if (!isOauthMcpPlatform(platform)) {
      return { error: "unknown_platform", status: 400 };
    }
    const descriptor = OAUTH_MCP_DIRECTORY[platform];

    const fromEnv = getMcpOauthEnvClient(descriptor.envPrefix);
    if (fromEnv) return fromEnv;

    const recordId = mcpOauthClientRecordId(platform);
    const stored = await tokenStore.get(recordId);
    if (
      stored &&
      String(stored.clientId || "").trim() &&
      String(stored.redirectUri || "") === redirectUri
    ) {
      return {
        clientId: String(stored.clientId),
        clientSecret: String(stored.clientSecret || ""),
      };
    }

    const registered = await registerMcpOauthClient(descriptor, { redirectUri });
    if (registered.ok === false) {
      return { error: registered.message, status: registered.status };
    }
    await tokenStore.set(recordId, {
      platform: "mcp_oauth_client",
      mcpPlatform: platform,
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
      redirectUri,
      registeredAt: new Date().toISOString(),
    });
    return { clientId: registered.clientId, clientSecret: registered.clientSecret };
  }

  app.get("/api/auth/mcp/:platform", async (req, res) => {
    const platform = String(req.params.platform || "").toLowerCase();
    const appBaseUrl = requestedAppBaseUrl(req);
    if (!isOauthMcpPlatform(platform)) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, "connections", buildOauthErrorParams("unknown_platform", {
          status: 400,
          exception: `No OAuth MCP provider named "${platform}".`,
        }))
      );
    }
    const descriptor = OAUTH_MCP_DIRECTORY[platform];
    const returnPage = parseOauthReturnPage(req) || oauthPageForPlatform(platform);
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;

    const redirectUri = oauthCallbackUrl(req, `/api/auth/mcp/${platform}/callback`);
    const client = await getMcpOauthClient(platform, redirectUri);
    if ("error" in client) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, buildOauthErrorParams("client_registration_failed", {
          status: client.status,
          exception: client.error,
        }))
      );
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    await oauthPendingStore.set(state, {
      platform,
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      redirectUri,
      codeVerifier,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });

    const url = new URL(descriptor.authUrl);
    url.searchParams.set("client_id", client.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    if (descriptor.scopes) url.searchParams.set("scope", descriptor.scopes);
    url.searchParams.set("code_challenge", generateCodeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/mcp/:platform/callback", async (req, res) => {
    const platform = String(req.params.platform || "").toLowerCase();
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    const fallbackPage = postOauthPage(pending, platform);
    if (!isOauthMcpPlatform(platform)) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), "connections", buildOauthErrorParams("unknown_platform", { status: 400 }))
      );
    }
    const descriptor = OAUTH_MCP_DIRECTORY[platform];
    if (error) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams(String(error)))
      );
    }
    if (!pending || pending.platform !== platform) {
      return res.redirect(
        buildPageUrlWithBase(BASE_URL, oauthPageForPlatform(platform), buildOauthErrorParams("invalid_state", {
          status: 400,
          exception: "OAuth state was missing or expired.",
        }))
      );
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("invalid_state", {
          status: 400,
          exception: "OAuth state did not match the active session.",
        }))
      );
    }
    await oauthPendingStore.delete(state);
    if (!code) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("missing_code"))
      );
    }

    const redirectUri =
      typeof pending.redirectUri === "string"
        ? pending.redirectUri
        : oauthCallbackUrl(req, `/api/auth/mcp/${platform}/callback`);
    const client = await getMcpOauthClient(platform, redirectUri);
    if ("error" in client || !pending.codeVerifier) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("client_registration_failed", {
          status: "error" in client ? client.status : 500,
          exception: "error" in client ? client.error : "PKCE verifier is missing.",
        }))
      );
    }

    try {
      const tokenResult = await exchangeMcpOauthCode(descriptor, {
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        code: String(code),
        codeVerifier: String(pending.codeVerifier),
        redirectUri,
      });
      if (tokenResult.ok === false) {
        return res.redirect(
          buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("token_exchange_failed", {
            status: tokenResult.status,
            exception: tokenResult.message,
          }))
        );
      }

      // Validate the token with an MCP initialize; the server name doubles
      // as the connected account's display identity.
      const conn = await connectOauthMcp(platform, tokenResult.accessToken).catch(() => null);
      const username = (conn && conn.ok && conn.handle.serverName) || descriptor.label;

      const accountId = profileScopedAccountId(platform, descriptor.mcpUrl, pending.profileId);
      const expiresAt = tokenResult.expiresIn
        ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
        : undefined;

      await tokenStore.set(accountId, {
        platform,
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        displayName: descriptor.label,
        profileUrl: descriptor.profileUrl,
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt,
        scope: tokenResult.scope || descriptor.scopes || undefined,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform,
        keepAccountId: accountId,
        matchers: [{ key: "displayName", value: descriptor.label }],
        sameProfileId: pending.profileId || null,
      });

      const postPage = postOauthPage(pending, platform);
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), postPage, {
          oauth_success: 1,
          platform,
          account_id: accountId,
          username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error(`${descriptor.label} OAuth error:`, err);
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("token_exchange_failed", {
          status: 500,
          exception: getExceptionMessage(err),
        }))
      );
    }
  });
}
