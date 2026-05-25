import type { Connection } from "@/types/connection";

/**
 * User-facing connection status taxonomy.
 *
 * Distinct from `ConnectionHealth` (internal DB enum). This is the vocabulary
 * the Connections Center surfaces in cards, filters and badges. Kept narrow
 * on purpose — more states here means more UI branches, so we only add one
 * when it maps to a visibly different user action.
 *
 * - connected: at least one row, healthy.
 * - not_connected: catalog entry with no row for this business profile.
 * - reconnect_required: provider revoked / token expired → user must re-auth.
 * - error: last sync produced a provider/app error.
 * - syncing: an OAuth or sync run is in flight (DB health=pending).
 */
export type ConnectionStatus =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error"
  | "syncing";

export const CONNECTION_STATUS_ORDER: readonly ConnectionStatus[] = [
  "error",
  "reconnect_required",
  "syncing",
  "connected",
  "not_connected",
] as const;

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  reconnect_required: "Reconnect required",
  error: "Error",
  syncing: "Syncing",
};

/**
 * Derive the presentation status from a single connection row.
 */
export function statusFromConnection(connection: Connection): ConnectionStatus {
  switch (connection.health) {
    case "failed":
      return "error";
    case "expired":
      return "reconnect_required";
    case "disconnected":
      return "not_connected";
    case "pending":
      return "syncing";
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
  if (connections.some((c) => c.health === "failed")) return "error";
  if (connections.some((c) => c.health === "expired")) return "reconnect_required";
  if (connections.some((c) => c.health === "pending")) return "syncing";
  return "connected";
}
