import type { ConnectionCatalogEntry } from "@/lib/connectionCatalog";
import type { Connection, ConnectionHealth } from "@/types/connection";
import { connectionSyncPermissionFix } from "@/lib/oauthPermissionErrors";

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
    const permissionFix = connectionSyncPermissionFix(connection.platform, connection.lastSyncError);
    const envHint = catalogEntry?.serverNeeds;
    if (permissionFix) {
      return envHint ? `${permissionFix} — Server: ${envHint}` : permissionFix;
    }
    if (connection.health === "failed" && envHint) {
      return `${connection.lastSyncError} — Server: ${envHint}`;
    }
    return connection.lastSyncError;
  }

  switch (connection.health as ConnectionHealth) {
    case "expired":
    case "missing":
      return "Koppla om och logga in igen för att förnya OAuth-token.";
    case "failed":
      return catalogEntry?.serverNeeds
        ? `Kontrollera serverkonfiguration: ${catalogEntry.serverNeeds}`
        : "Granska integrationsinställningar under Inställningar.";
    case "disconnected":
      return catalogEntry?.connectSteps ?? "Koppla den här integrationen igen.";
    case "pending":
      return "Synk pågår — testa igen om en stund.";
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
    return { title: "Koppling OK", description: result.message ?? "Uppgifterna verifierades." };
  }
  const description = [result.message, result.fix].filter(Boolean).join(" — ");
  return {
    title: "Kopplingen behöver uppmärksamhet",
    description: description || "Testet gick inte igenom.",
    variant: "destructive",
  };
}
