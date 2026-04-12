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
};

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Pure helper — used by tests and getOAuthRedirectUrl().
 */
export function buildOAuthRedirectUrl(input: OAuthRedirectBuildInput): string {
  const pathname = input.pathname || "/";
  const search = input.search || "";
  const pathWithQuery = `${pathname}${search}` || "/";

  let baseOrigin = input.windowOrigin;

  if (input.prod) {
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
  }

  return new URL(pathWithQuery, baseOrigin).href;
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
  });
}
