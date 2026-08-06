import type { AccountPlatform, IntelligencePlatform } from "@/types/accounts";
import { MCP_KEYED_PLATFORMS, MCP_OAUTH_PLATFORMS, getMcpProviderMeta } from "./mcpProviders";

/**
 * Everything that is not a remote MCP provider. MCP entries are generated from
 * the provider lists; these are hand-written, so they are typed as an
 * exhaustive record — adding a platform to `AccountPlatform` without wiring a
 * connect path here is a compile error, not a dead Connect button.
 */
type NativePlatform = Exclude<AccountPlatform, IntelligencePlatform>;

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

const NATIVE_CONFIG: Record<NativePlatform, ConnectStartConfig> = {
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

  // Economy
  fortnox: { authPath: "fortnox" },

  // Messaging
  gmail: { authPath: "gmail" },
  outlook: { authPath: "outlook" },

  // Calendar — Official API is the working path. Zernio connects but returns
  // empty events on current tenants (see zernioGenericHandler).
  google_calendar: { authPath: "google_calendar", provider: "official" },
  outlook_calendar: { authPath: "outlook_calendar", provider: "official" },

  // Reviews — Official Google Business / Tripadvisor Content API. Zernio
  // reviews endpoints 404 on current plans (see docs/KOPPLINGAR.md).
  google_reviews: { authPath: "google_reviews", provider: "official" },
  tripadvisor: { authPath: "tripadvisor", provider: "official" },
  judgeme: { authPath: "judgeme" },

  // Content
  google_drive: { authPath: "google_drive" },
  canva: { authPath: "canva" },
};

const MCP_CONFIG = {
  ...Object.fromEntries(
    MCP_OAUTH_PLATFORMS.map((platform) => [platform, { authPath: `mcp/${platform}` }])
  ),
  ...Object.fromEntries(
    MCP_KEYED_PLATFORMS.map((platform) => [platform, { authPath: `mcp/${platform}`, manual: true }])
  ),
} as Record<IntelligencePlatform, ConnectStartConfig>;

const CONFIG: Record<AccountPlatform, ConnectStartConfig> = { ...NATIVE_CONFIG, ...MCP_CONFIG };

const NATIVE_PATH_OPTIONS: Record<NativePlatform, ConnectionPathOption[]> = {
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
    { id: "official", label: "Google official", isDefault: true },
    { id: "zernio", label: "Zernio" },
  ],
  outlook_calendar: [
    { id: "official", label: "Microsoft official", isDefault: true },
    { id: "zernio", label: "Zernio" },
  ],
  google_reviews: [
    { id: "official", label: "Google official", isDefault: true },
    { id: "zernio", label: "Zernio" },
  ],
  tripadvisor: [
    { id: "official", label: "Tripadvisor official", isDefault: true },
    { id: "zernio", label: "Zernio" },
  ],
  judgeme: [{ id: "manual", label: "Shop-domän + API-token", isDefault: true }],
  fortnox: [{ id: "official", label: "Fortnox official", isDefault: true }],
  google_drive: [{ id: "official", label: "Google official", isDefault: true }],
  canva: [{ id: "official", label: "Canva Connect", isDefault: true }],
};

const MCP_PATH_OPTIONS = {
  ...Object.fromEntries(
    MCP_OAUTH_PLATFORMS.map((platform) => [
      platform,
      [{ id: "official", label: "OAuth MCP", isDefault: true }],
    ])
  ),
  ...Object.fromEntries(
    MCP_KEYED_PLATFORMS.map((platform) => {
      const meta = getMcpProviderMeta(platform);
      return [
        platform,
        [
          {
            id: "manual" as const,
            label: meta?.auth === "keyless" ? "Koppla med ett klick" : "Koppla med uppgifter",
            isDefault: true,
          },
        ],
      ];
    })
  ),
} as Record<IntelligencePlatform, ConnectionPathOption[]>;

const PATH_OPTIONS: Record<AccountPlatform, ConnectionPathOption[]> = {
  ...NATIVE_PATH_OPTIONS,
  ...MCP_PATH_OPTIONS,
};

/**
 * Every platform that has a connect path wired. `NATIVE_CONFIG` is compile-time
 * exhaustive and the MCP half comes from the provider registry, so this is the
 * list the catalog is checked against.
 */
export function listConnectablePlatforms(): AccountPlatform[] {
  return Object.keys(CONFIG) as AccountPlatform[];
}

export function getConnectConfig(platform: AccountPlatform): ConnectStartConfig | null {
  return CONFIG[platform] ?? null;
}

export function getConnectionPathOptions(platform: AccountPlatform): ConnectionPathOption[] {
  return PATH_OPTIONS[platform] ?? [];
}
