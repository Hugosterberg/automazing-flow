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

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getAuthBaseOrigin(input: OAuthRedirectBuildInput): string {
  let baseOrigin = input.windowOrigin;

  if (!input.prod) return baseOrigin;

  const candidates = [
    input.viteSiteUrl,
    input.viteAppUrl,
    input.viteVercelDeploymentOrigin,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (!isLoopbackHostname(parsed.hostname)) {
        baseOrigin = `${parsed.protocol}//${parsed.host}`;
        break;
      }
    } catch {
      // skip invalid URL
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
    windowOrigin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });
}
