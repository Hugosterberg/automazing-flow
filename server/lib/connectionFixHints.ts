/**
 * Actionable fix hints when a connection test fails or health is degraded.
 * Kept server-side so POST /api/connections/:id/resync can return them.
 */

import {
  connectionSyncLooksLikePermissionError,
  connectionSyncPermissionFix,
} from "./oauthPermissionErrors.ts";

const PLATFORM_SERVER_NEEDS: Record<string, string> = {
  instagram: "Set ZERNIO_API_KEY or INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET.",
  facebook: "Set ZERNIO_API_KEY or connect via Meta official OAuth.",
  google_ads: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ADS_DEVELOPER_TOKEN.",
  google_business: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, or ZERNIO_API_KEY.",
  google_calendar: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
  gmail: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
  google_drive: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
  youtube: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET or ZERNIO_API_KEY.",
  outlook: "Set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.",
  outlook_calendar: "Set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.",
  shopify: "Set SHOPIFY_API_KEY + SHOPIFY_API_SECRET (or connect with shop domain).",
  meta_business: "Set META_APP_ID + META_APP_SECRET or ZERNIO_API_KEY.",
  tiktok: "Set TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET or ZERNIO_API_KEY.",
  x: "Connect via ZERNIO_API_KEY.",
  whatsapp: "Connect via ZERNIO_API_KEY with WhatsApp add-on enabled.",
  canva: "Set CANVA_CLIENT_ID + CANVA_CLIENT_SECRET.",
  zernio: "Set ZERNIO_API_KEY (and optional ZERNIO_PROFILE_ID).",
};

export interface ConnectionTestFeedback {
  message: string;
  fix?: string;
}

export function connectionTestFeedback(args: {
  platform: string;
  health: string;
  lastSyncError?: string | null;
}): ConnectionTestFeedback {
  const { platform, health, lastSyncError } = args;
  const envFix = PLATFORM_SERVER_NEEDS[platform];

  if (health === "healthy") {
    return { message: "Connection verified — credentials look good." };
  }

  if (health === "expired" || health === "missing") {
    return {
      message: lastSyncError || "Session expired or account was removed at the provider.",
      fix: "Click Reconnect and sign in again to refresh tokens.",
    };
  }

  if (health === "failed") {
    const permissionFix =
      lastSyncError && connectionSyncLooksLikePermissionError(lastSyncError)
        ? connectionSyncPermissionFix(platform, lastSyncError)
        : null;
    return {
      message: lastSyncError || "Last sync failed at the provider.",
      fix: permissionFix || (envFix ? `Check server config: ${envFix}` : "Review integration settings under Preferences."),
    };
  }

  if (health === "disconnected") {
    return {
      message: "This account is disconnected.",
      fix: "Connect the integration again from this card.",
    };
  }

  if (health === "pending") {
    return {
      message: "Connection sync is still in progress.",
      fix: "Wait a moment and test again.",
    };
  }

  return {
    message: lastSyncError || "Connection needs attention.",
    fix: envFix,
  };
}
