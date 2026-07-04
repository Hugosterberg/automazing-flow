import type { ConnectionCatalogEntry } from "@/lib/connectionCatalog";
import type { Connection, ConnectionHealth } from "@/types/connection";

/**
 * Client-side fix-it hint for an unhealthy connection row.
 * Complements server-side hints returned from POST /api/connections/:id/resync.
 */
export function connectionFixHint(
  connection: Connection,
  catalogEntry: ConnectionCatalogEntry | undefined
): string | null {
  if (connection.health === "healthy") return null;

  if (connection.lastSyncError) {
    const envHint = catalogEntry?.serverNeeds;
    if (connection.health === "failed" && envHint) {
      return `${connection.lastSyncError} — Server: ${envHint}`;
    }
    return connection.lastSyncError;
  }

  switch (connection.health as ConnectionHealth) {
    case "expired":
    case "missing":
      return "Reconnect and sign in again to refresh OAuth tokens.";
    case "failed":
      return catalogEntry?.serverNeeds
        ? `Check server configuration: ${catalogEntry.serverNeeds}`
        : "Review integration settings under Preferences.";
    case "disconnected":
      return catalogEntry?.connectSteps ?? "Connect this integration again.";
    case "pending":
      return "Sync in progress — try testing again in a moment.";
    default:
      return catalogEntry?.serverNeeds ?? null;
  }
}

export function connectionTestToastMessage(result: {
  health: string;
  message?: string;
  fix?: string;
}): { title: string; description?: string; variant?: "destructive" } {
  if (result.health === "healthy") {
    return { title: "Connection OK", description: result.message ?? "Credentials verified." };
  }
  const description = [result.message, result.fix].filter(Boolean).join(" — ");
  return {
    title: "Connection needs attention",
    description: description || "Test did not pass.",
    variant: "destructive",
  };
}
