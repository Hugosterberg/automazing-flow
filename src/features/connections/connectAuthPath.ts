import type { AccountPlatform } from "@/types/accounts";

/**
 * Maps a catalog platform to the server-side OAuth start path.
 *
 * Single source of truth for which platforms are routed through Zernio vs
 * native OAuth. `provider: "zernio"` forces the Zernio broker even when the
 * server also implements a native path.
 */
export interface ConnectStartConfig {
  authPath: string;
  provider?: "zernio" | "official";
  manual?: boolean;
}

const CONFIG: Record<AccountPlatform, ConnectStartConfig> = {
  // Social — all via Zernio.
  instagram: { authPath: "instagram", provider: "zernio" },
  facebook: { authPath: "facebook", provider: "zernio" },
  whatsapp: { authPath: "whatsapp", provider: "zernio" },
  google_business: { authPath: "google_business" },
  tiktok: { authPath: "tiktok", provider: "zernio" },
  youtube: { authPath: "youtube" },
  x: { authPath: "x" },

  // Ecommerce / org
  shopify: { authPath: "shopify" },
  notion: { authPath: "notion" },

  // Messaging
  gmail: { authPath: "gmail" },
  outlook: { authPath: "outlook" },

  // Calendar (Zernio preferred)
  google_calendar: { authPath: "google_calendar", provider: "zernio" },
  outlook_calendar: { authPath: "outlook_calendar", provider: "zernio" },

  // Reviews
  google_reviews: { authPath: "google_reviews", provider: "zernio" },
  tripadvisor: { authPath: "tripadvisor", provider: "zernio" },

  // Content
  google_drive: { authPath: "google_drive" },
};

export function getConnectConfig(platform: AccountPlatform): ConnectStartConfig | null {
  return CONFIG[platform] ?? null;
}
