import {
  catalogConnectSteps,
  type ConnectionCatalogEntry,
} from "@/lib/connectionCatalog";
import { t } from "@/lib/i18n";
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
      return envHint
        ? t("connections:fix.withServer", { message: permissionFix, server: envHint })
        : permissionFix;
    }
    if (connection.health === "failed" && envHint) {
      return t("connections:fix.withServer", {
        message: connection.lastSyncError,
        server: envHint,
      });
    }
    return connection.lastSyncError;
  }

  switch (connection.health as ConnectionHealth) {
    case "expired":
    case "missing":
      return t("connections:fix.reauth");
    case "failed":
      return catalogEntry?.serverNeeds
        ? t("connections:fix.checkServer", { server: catalogEntry.serverNeeds })
        : t("connections:fix.checkPrefs");
    case "disconnected":
      return catalogEntry
        ? catalogConnectSteps(catalogEntry)
        : t("errors:reconnectGeneric");
    case "pending":
      return t("connections:fix.pending");
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
    return {
      title: t("connections:toast.ok"),
      description: result.message ?? t("connections:toast.okDesc"),
    };
  }
  const description = [result.message, result.fix].filter(Boolean).join(" — ");
  return {
    title: t("connections:toast.attention"),
    description: description || t("connections:toast.failDesc"),
    variant: "destructive",
  };
}
