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

export interface ConnectionPathOption {
  id: "zernio" | "official" | "manual";
  label: string;
  isDefault?: boolean;
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

  // Marketing
  google_ads: { authPath: "google_ads", provider: "official" },
  meta_business: { authPath: "meta_business", provider: "official" },

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
  google_reviews: { authPath: "google_reviews" },
  tripadvisor: { authPath: "tripadvisor" },

  // Content
  google_drive: { authPath: "google_drive" },
  canva: { authPath: "canva" },
};

const PATH_OPTIONS: Record<AccountPlatform, ConnectionPathOption[]> = {
  instagram: [
    { id: "zernio", label: "Zernio", isDefault: true },
    { id: "official", label: "Instagram official" },
  ],
  facebook: [{ id: "zernio", label: "Zernio", isDefault: true }],
  whatsapp: [{ id: "zernio", label: "Zernio", isDefault: true }],
  google_business: [
    { id: "official", label: "Google official", isDefault: true },
    { id: "zernio", label: "Zernio" },
  ],
  tiktok: [
    { id: "zernio", label: "Zernio", isDefault: true },
    { id: "official", label: "TikTok official" },
  ],
  youtube: [{ id: "official", label: "Google official", isDefault: true }],
  x: [{ id: "official", label: "X official", isDefault: true }],
  google_ads: [
    { id: "official", label: "Google official", isDefault: true },
    { id: "zernio", label: "Zernio" },
  ],
  meta_business: [{ id: "official", label: "Meta official", isDefault: true }],
  shopify: [{ id: "official", label: "Shopify official", isDefault: true }],
  notion: [{ id: "official", label: "Notion official", isDefault: true }],
  gmail: [{ id: "official", label: "Google official", isDefault: true }],
  outlook: [{ id: "official", label: "Microsoft official", isDefault: true }],
  google_calendar: [
    { id: "zernio", label: "Zernio", isDefault: true },
    { id: "official", label: "Google official" },
  ],
  outlook_calendar: [
    { id: "zernio", label: "Zernio", isDefault: true },
    { id: "official", label: "Microsoft official" },
  ],
  google_reviews: [
    { id: "zernio", label: "Zernio", isDefault: true },
    { id: "official", label: "Google official" },
  ],
  tripadvisor: [
    { id: "zernio", label: "Zernio", isDefault: true },
    { id: "official", label: "Tripadvisor official" },
  ],
  google_drive: [{ id: "official", label: "Google official", isDefault: true }],
  canva: [{ id: "official", label: "Canva Connect", isDefault: true }],
};

export function getConnectConfig(platform: AccountPlatform): ConnectStartConfig | null {
  return CONFIG[platform] ?? null;
}

export function getConnectionPathOptions(platform: AccountPlatform): ConnectionPathOption[] {
  return PATH_OPTIONS[platform] ?? [];
}
