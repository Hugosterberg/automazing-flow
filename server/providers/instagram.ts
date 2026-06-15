/**
 * Instagram (Basic Display / Graph) token lifecycle.
 *
 * Instagram OAuth returns a SHORT-lived token (~1 hour). It must be exchanged
 * for a LONG-lived token (~60 days), which in turn must be refreshed before it
 * expires (the token must be >24h old and still valid to refresh). There is no
 * separate refresh_token — the long-lived access token is exchanged for a new
 * one. Without this lifecycle an Instagram connection silently dies (after 1h
 * if never exchanged, or after 60 days if never refreshed).
 *
 * These helpers are shared by the OAuth connect callback (initial exchange) and
 * the account-data handler (proactive + reactive refresh on use).
 */

const IG_GRAPH = "https://graph.instagram.com";
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

export type InstagramTokenResult = { accessToken: string; expiresAt: string } | null;

function expiresAtFrom(expiresIn: unknown): string {
  const secs = Number(expiresIn);
  const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : SIXTY_DAYS_MS;
  return new Date(Date.now() + ms).toISOString();
}

/** Exchange a short-lived Instagram token (~1h) for a long-lived one (~60 days). */
export async function exchangeForLongLivedInstagramToken(
  shortLivedToken: string,
  clientSecret: string
): Promise<InstagramTokenResult> {
  if (!shortLivedToken || !clientSecret) return null;
  const url =
    `${IG_GRAPH}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&access_token=${encodeURIComponent(shortLivedToken)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const d = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!r.ok || !d.access_token) return null;
    return { accessToken: String(d.access_token), expiresAt: expiresAtFrom(d.expires_in) };
  } catch {
    return null;
  }
}

/** Refresh a long-lived Instagram token, extending it ~60 days. */
export async function refreshLongLivedInstagramToken(longLivedToken: string): Promise<InstagramTokenResult> {
  if (!longLivedToken) return null;
  const url =
    `${IG_GRAPH}/refresh_access_token?grant_type=ig_refresh_token` +
    `&access_token=${encodeURIComponent(longLivedToken)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const d = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!r.ok || !d.access_token) return null;
    return { accessToken: String(d.access_token), expiresAt: expiresAtFrom(d.expires_in) };
  } catch {
    return null;
  }
}

/**
 * True when a stored long-lived token is inside the proactive refresh window
 * (expiring within ~10 days). For a 60-day token this only fires once the token
 * is well past the 24h minimum age Instagram requires for a refresh.
 */
export function shouldRefreshInstagramToken(expiresAt: unknown, now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const exp = Date.parse(String(expiresAt));
  if (!Number.isFinite(exp)) return false;
  return exp - now < REFRESH_WINDOW_MS;
}

/** Instagram surfaces expired/invalid tokens as an OAuthException (code 190). */
export function isInstagramAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { type?: string; code?: number };
  return e.type === "OAuthException" || e.code === 190;
}
