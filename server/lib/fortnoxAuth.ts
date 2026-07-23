/**
 * Shared Fortnox access-token freshening — access tokens live ~1h, refresh
 * tokens rotate on every use and are valid 45 days. Used by both the Economy
 * routes (interactive requests) and the Fortnox crons (payment sync), so the
 * refresh/persist logic lives in one place.
 */

import { refreshFortnoxAccessToken } from "../providers/fortnox.ts";

export interface StoredFortnoxAccount {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

interface TokenStoreLike {
  get(accountId: string): Promise<Record<string, unknown> | null | undefined>;
  set(accountId: string, value: Record<string, unknown>): Promise<unknown>;
}

function tokenFreshEnough(stored: StoredFortnoxAccount): boolean {
  const raw = String(stored.expiresAt || "").trim();
  if (!raw) return true;
  const expiresAt = new Date(raw).getTime();
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000;
}

/** Returns a usable Fortnox access token, refreshing and persisting a new pair if the stored one is stale. */
export async function getFreshFortnoxAccessToken(
  tokenStore: TokenStoreLike,
  accountId: string,
  stored: StoredFortnoxAccount
): Promise<string | null> {
  if (stored.accessToken && tokenFreshEnough(stored)) return String(stored.accessToken);
  const clientId = String(process.env.FORTNOX_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.FORTNOX_CLIENT_SECRET || "").trim();
  const refreshToken = String(stored.refreshToken || "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return stored.accessToken ? String(stored.accessToken) : null;
  }
  const refreshed = await refreshFortnoxAccessToken({ clientId, clientSecret, refreshToken });
  if (!refreshed.ok) return stored.accessToken ? String(stored.accessToken) : null;
  await tokenStore.set(accountId, {
    ...stored,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : stored.expiresAt,
  });
  return refreshed.accessToken;
}
