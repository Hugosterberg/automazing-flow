import type { Connection } from "@/types/connection";

/**
 * Data freshness for the home dashboard: when did any connection last sync,
 * and which ones are stale? Pure — the strip component feeds it connections
 * from useConnections and renders the result.
 */

/** A connection counts as stale when its last sync is older than this. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SyncFreshness {
  /** Most recent lastSyncedAt across active connections, or null. */
  latestSyncedAt: string | null;
  /** Active connections whose last sync is older than STALE_AFTER_MS. */
  stale: Connection[];
  /** Active connections that have never recorded a sync. */
  neverSynced: Connection[];
  /** Total active connections considered. */
  total: number;
}

function syncedMs(connection: Connection): number | null {
  if (!connection.lastSyncedAt) return null;
  const ms = Date.parse(connection.lastSyncedAt);
  return Number.isFinite(ms) ? ms : null;
}

export function computeSyncFreshness(
  connections: Connection[],
  nowMs: number = Date.now()
): SyncFreshness {
  const active = connections.filter((c) => !c.disconnectedAt);
  let latestMs = -Infinity;
  let latestIso: string | null = null;
  const stale: Connection[] = [];
  const neverSynced: Connection[] = [];

  for (const connection of active) {
    const ms = syncedMs(connection);
    if (ms == null) {
      neverSynced.push(connection);
      continue;
    }
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = connection.lastSyncedAt ?? null;
    }
    if (nowMs - ms > STALE_AFTER_MS) stale.push(connection);
  }

  return { latestSyncedAt: latestIso, stale, neverSynced, total: active.length };
}

/** Relative ago for sync strips — respects UI language (sv/en). */
export function formatAgo(iso: string, lang: string = "sv", nowMs: number = Date.now()): string {
  const en = lang.toLowerCase().startsWith("en");
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return en ? "just now" : "just nu";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return en ? "just now" : "just nu";
  if (mins < 60) return en ? `${mins} min ago` : `${mins} min sedan`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return en ? `${hours} h ago` : `${hours} h sedan`;
  const days = Math.floor(hours / 24);
  return en ? `${days} d ago` : `${days} d sedan`;
}

/** @deprecated Prefer formatAgo(iso, lang). Kept for callers/tests that expect Swedish. */
export function formatAgoSv(iso: string, nowMs: number = Date.now()): string {
  return formatAgo(iso, "sv", nowMs);
}
