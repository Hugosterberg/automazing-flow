import type { Connection } from "@/types/connection";

/**
 * User-facing connection status taxonomy.
 *
 * Distinct from `ConnectionHealth` (internal DB enum). This is the vocabulary
 * the Connections Center surfaces in cards, filters and badges. Kept narrow
 * on purpose — more states here means more UI branches, so we only add one
 * when it maps to a visibly different user action.
 *
 * - connected: at least one row, healthy, not paused.
 * - not_connected: catalog entry with no row for this business profile.
 * - reconnect_required: provider revoked / token expired → user must re-auth.
 * - error: last sync produced a provider/app error.
 * - syncing: an OAuth or sync run is in flight (DB health=pending).
 * - paused: user soft-disconnected; row is kept so they can resume.
 */
export type ConnectionStatus =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error"
  | "syncing"
  | "paused";

export const CONNECTION_STATUS_ORDER: readonly ConnectionStatus[] = [
  "error",
  "reconnect_required",
  "syncing",
  "paused",
  "connected",
  "not_connected",
] as const;

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  reconnect_required: "Reconnect required",
  error: "Error",
  syncing: "Syncing",
  paused: "Paused",
};

/**
 * Derive the presentation status from a single connection row.
 * Paused (soft-disconnected) takes precedence over health, because a paused
 * row with stale `health=healthy` should still appear paused to the user.
 */
export function statusFromConnection(connection: Connection): ConnectionStatus {
  if (connection.disconnectedAt) return "paused";
  switch (connection.health) {
    case "failed":
      return "error";
    case "expired":
      return "reconnect_required";
    case "pending":
      return "syncing";
    case "disconnected":
      return "paused";
    case "missing":
      return "not_connected";
    case "healthy":
    default:
      return "connected";
  }
}

/**
 * Aggregate several connection rows (same integration, same business profile)
 * into a single status for a catalog card. Precedence follows severity: an
 * error on any linked account beats a healthy one.
 */
export function aggregateStatus(connections: Connection[]): ConnectionStatus {
  if (connections.length === 0) return "not_connected";

  const allPaused = connections.every((c) => Boolean(c.disconnectedAt));
  if (allPaused) return "paused";

  const active = connections.filter((c) => !c.disconnectedAt);
  if (active.some((c) => c.health === "failed")) return "error";
  if (active.some((c) => c.health === "expired")) return "reconnect_required";
  if (active.some((c) => c.health === "pending")) return "syncing";
  if (active.length === 0) return "paused";
  return "connected";
}
