import type { AccountPlatform } from "./accounts";

/**
 * Derived health of a connected external account.
 * - healthy: last sync OK, tokens valid.
 * - expired: provider requires re-auth (e.g. refresh token invalid).
 * - failed:  last sync produced an error (see lastSyncError).
 * - disconnected: legacy/manual disconnect state; hidden from active connection UI.
 * - pending: OAuth in flight, not yet completed.
 * - missing: row exists but its credentials/token record is gone. Treated
 *   like `expired` everywhere (daily brief, home tiles, connection cards):
 *   the user action is a re-auth.
 */
export type ConnectionHealth =
  | "healthy"
  | "expired"
  | "failed"
  | "disconnected"
  | "pending"
  | "missing";

/**
 * Enrichment from the global `integrations` catalog, populated when a
 * connection's `platform` matches an `integrations.slug`. Null for
 * platforms not yet seeded in the catalog.
 */
export interface ConnectionIntegrationInfo {
  name: string;
  category: string;
  provider: string;
}

/**
 * One external account linked to one business profile.
 * Mirrors the `v_connection_health` view post-migration, which joins
 * `connected_accounts` with the `integrations` catalog.
 */
export interface Connection {
  id: string;
  businessProfileId: string;
  platform: AccountPlatform;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  connectedAt: string;
  disconnectedAt?: string | null;
  isOAuth: boolean;
  isZernio: boolean;
  zernioAccountId?: string;
  health: ConnectionHealth;
  lastSyncedAt?: string;
  /**
   * Timestamp of the most recent sync run that finished with status='success'.
   * Denormalised onto the row by the server sync worker after a successful
   * reconcile/sync, so list pages avoid a per-row subquery into sync_runs.
   * Nullable — empty until the first successful sync.
   */
  lastSuccessfulSyncAt?: string;
  lastSyncError?: string;
  integration?: ConnectionIntegrationInfo;
}

/** Shape returned by the Zernio reconcile endpoint per platform. */
export interface ConnectionHealthReport {
  connectionId: string;
  platform: AccountPlatform;
  health: ConnectionHealth;
  lastSyncedAt?: string;
  lastSyncError?: string;
}
