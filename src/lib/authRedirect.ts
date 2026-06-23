/**
 * Supabase Auth redirect after Google (etc.) must match a URL under
 * Authentication → URL Configuration → Redirect URLs.
 * Site URL in Supabase must NOT be localhost for production.
 */

export type OAuthRedirectBuildInput = {
  /** import.meta.env.PROD */
  prod: boolean;
  viteSiteUrl: string;
  viteAppUrl: string;
  /** Set automatically on Vercel builds via vite.config (from VERCEL_URL). */
  viteVercelDeploymentOrigin: string;
  /** Set automatically on Vercel builds via vite.config (from VERCEL_PROJECT_PRODUCTION_URL). */
  viteVercelProductionOrigin?: string;
  windowOrigin: string;
  pathname: string;
  search: string;
  hash?: string;
};

const AUTH_PENDING_RETURN_KEY = "automazing-auth-pending-return";
const AUTH_CALLBACK_PARAMS = new Set([
  "code",
  "state",
  "error",
  "error_code",
  "error_description",
]);
const OAUTH_CALLBACK_PARAMS = new Set(["oauth_success", "oauth_error"]);

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function parseUrlSafe(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function getAuthBaseOrigin(input: OAuthRedirectBuildInput): string {
  const baseOrigin = input.windowOrigin;

  if (!input.prod) return baseOrigin;

  // PKCE constraint: supabase-js stores the code_verifier in localStorage on
  // the origin where sign-in STARTED. If the OAuth redirect lands on any
  // other origin (canonical alias vs deployment URL, www vs apex, …) the
  // verifier is missing, the code exchange fails silently, and the user is
  // dumped back on the login screen — signing in "works the second time"
  // because the retry starts and ends on the same origin. So the current
  // origin always wins when it's a real host; env candidates only matter
  // when the window origin is loopback (e.g. a local production build).
  const windowUrl = parseUrlSafe(baseOrigin);
  const isWindowLoopback = windowUrl ? isLoopbackHostname(windowUrl.hostname) : true;
  if (!isWindowLoopback) return baseOrigin;

  const candidates = [
    input.viteSiteUrl,
    input.viteAppUrl,
    input.viteVercelProductionOrigin || "",
    input.viteVercelDeploymentOrigin,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const parsed = parseUrlSafe(raw);
    if (parsed && !isLoopbackHostname(parsed.hostname)) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  }

  return baseOrigin;
}

/**
 * Pure helper — used by tests and getOAuthRedirectUrl().
 */
export function buildOAuthRedirectUrl(input: OAuthRedirectBuildInput): string {
  return new URL("/", getAuthBaseOrigin(input)).href;
}

export function buildAuthReturnPath(
  input: Pick<OAuthRedirectBuildInput, "pathname" | "search" | "hash">
): string {
  const pathname = input.pathname && input.pathname.startsWith("/") ? input.pathname : "/";
  const params = new URLSearchParams(input.search || "");

  for (const key of AUTH_CALLBACK_PARAMS) {
    params.delete(key);
  }

  const search = params.toString();
  const hash = input.hash || "";
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

export function storePendingAuthReturn(): void {
  sessionStorage.setItem(
    AUTH_PENDING_RETURN_KEY,
    buildAuthReturnPath({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    })
  );
}

export function readPendingAuthReturn(): string | null {
  const value = sessionStorage.getItem(AUTH_PENDING_RETURN_KEY);
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function clearPendingAuthReturn(): void {
  sessionStorage.removeItem(AUTH_PENDING_RETURN_KEY);
}

export function getOAuthRedirectUrl(): string {
  return buildOAuthRedirectUrl({
    prod: import.meta.env.PROD,
    viteSiteUrl: (import.meta.env.VITE_SITE_URL || "").trim(),
    viteAppUrl: (import.meta.env.VITE_APP_URL || "").trim(),
    viteVercelDeploymentOrigin: (import.meta.env.VITE_VERCEL_DEPLOYMENT_ORIGIN || "").trim(),
    viteVercelProductionOrigin: (import.meta.env.VITE_VERCEL_PRODUCTION_ORIGIN || "").trim(),
    windowOrigin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });
}

function firstNonLoopbackOrigin(values: string[]): string | null {
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const parsed = parseUrlSafe(value);
    if (parsed && !isLoopbackHostname(parsed.hostname)) {
      return parsed.origin;
    }
  }
  return null;
}

function isSameVercelAppOrigin(origin: string, canonicalOrigin: string): boolean {
  const originUrl = parseUrlSafe(origin);
  const canonicalUrl = parseUrlSafe(canonicalOrigin);
  if (!originUrl || !canonicalUrl) return false;
  const host = originUrl.hostname.toLowerCase();
  const canonicalHost = canonicalUrl.hostname.toLowerCase();
  if (!host.endsWith(".vercel.app") || !canonicalHost.endsWith(".vercel.app")) return false;
  if (host === canonicalHost) return true;
  const alias = canonicalHost.replace(/\.vercel\.app$/, "");
  if (alias && host.startsWith(`${alias}-`)) return true;
  const aliasRoot = alias.split("-")[0];
  return Boolean(aliasRoot && host.startsWith(`${aliasRoot}-`));
}

export type AuthCallbackCanonicalizeInput = {
  prod: boolean;
  siteUrl: string;
  appUrl: string;
  vercelDeploymentOrigin: string;
  vercelProductionOrigin?: string;
  windowOrigin: string;
  pathname: string;
  search: string;
  hash?: string;
  hasPendingAuthReturn: boolean;
};

export function buildCanonicalAuthCallbackUrl(input: AuthCallbackCanonicalizeInput): string | null {
  if (!input.prod || input.hasPendingAuthReturn) return null;

  const params = new URLSearchParams(input.search || "");
  const hasSupabaseCallback = params.has("code") || params.has("error") || params.has("error_code");
  if (!hasSupabaseCallback) return null;

  const canonicalOrigin = firstNonLoopbackOrigin([
    input.siteUrl,
    input.appUrl,
    input.vercelProductionOrigin || "",
  ]);
  if (!canonicalOrigin || canonicalOrigin === input.windowOrigin) return null;

  const deploymentOrigin = firstNonLoopbackOrigin([input.vercelDeploymentOrigin]);
  if (deploymentOrigin && deploymentOrigin !== input.windowOrigin) return null;

  const pathname = input.pathname && input.pathname.startsWith("/") ? input.pathname : "/";
  return `${canonicalOrigin}${pathname}${input.search || ""}${input.hash || ""}`;
}

/**
 * If Supabase sends a PKCE callback to Vercel's deployment URL while sign-in
 * started on the production alias, move the full callback URL back to the
 * alias before supabase-js tries to exchange the code.
 */
export function redirectMismatchedAuthCallbackToCanonicalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const target = buildCanonicalAuthCallbackUrl({
    prod: import.meta.env.PROD,
    siteUrl: (import.meta.env.VITE_SITE_URL || "").trim(),
    appUrl: (import.meta.env.VITE_APP_URL || "").trim(),
    vercelDeploymentOrigin: (import.meta.env.VITE_VERCEL_DEPLOYMENT_ORIGIN || "").trim(),
    vercelProductionOrigin: (import.meta.env.VITE_VERCEL_PRODUCTION_ORIGIN || "").trim(),
    windowOrigin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    hasPendingAuthReturn: Boolean(readPendingAuthReturn()),
  });
  if (!target) return false;
  window.location.replace(target);
  return true;
}

export type AppOriginCanonicalizeInput = {
  prod: boolean;
  siteUrl: string;
  appUrl: string;
  vercelProductionOrigin?: string;
  windowOrigin: string;
  pathname: string;
  search: string;
  hash?: string;
};

export function buildCanonicalAppOriginUrl(input: AppOriginCanonicalizeInput): string | null {
  if (!input.prod) return null;

  const params = new URLSearchParams(input.search || "");
  for (const key of [...AUTH_CALLBACK_PARAMS, ...OAUTH_CALLBACK_PARAMS]) {
    if (params.has(key)) return null;
  }

  const canonicalOrigin = firstNonLoopbackOrigin([
    input.siteUrl,
    input.appUrl,
    input.vercelProductionOrigin || "",
  ]);
  if (!canonicalOrigin || canonicalOrigin === input.windowOrigin) return null;
  if (!isSameVercelAppOrigin(input.windowOrigin, canonicalOrigin)) return null;

  const pathname = input.pathname && input.pathname.startsWith("/") ? input.pathname : "/";
  return `${canonicalOrigin}${pathname}${input.search || ""}${input.hash || ""}`;
}

export function redirectMismatchedAppOriginToCanonicalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const target = buildCanonicalAppOriginUrl({
    prod: import.meta.env.PROD,
    siteUrl: (import.meta.env.VITE_SITE_URL || "").trim(),
    appUrl: (import.meta.env.VITE_APP_URL || "").trim(),
    vercelProductionOrigin: (import.meta.env.VITE_VERCEL_PRODUCTION_ORIGIN || "").trim(),
    windowOrigin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });
  if (!target) return false;
  window.location.replace(target);
  return true;
}
