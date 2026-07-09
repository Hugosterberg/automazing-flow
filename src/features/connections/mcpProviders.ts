import type { IntelligencePlatform } from "@/types/accounts";
import { buildConnectUrl } from "./zernioClient";

export type McpAuthKind = "oauth" | "api_key" | "shop_domain" | "keyless";

export interface McpProviderMeta {
  platform: IntelligencePlatform;
  auth: McpAuthKind;
  /** Shown in manual-connect dialogs. */
  credentialLabel: string;
  credentialPlaceholder?: string;
}

/** OAuth-secured remote MCP servers (see server/providers/mcpOauth.ts). */
export const MCP_OAUTH_PLATFORMS = [
  "dayai",
  "windsor",
  "era",
  "ahrefs",
  "canva_mcp",
  "superhuman_mcp",
  "supermetrics_mcp",
] as const satisfies readonly IntelligencePlatform[];

/** API-key or shop-domain MCP servers (see server/providers/mcpDirectory.ts). */
export const MCP_KEYED_PLATFORMS = [
  "exa",
  "klarity",
  "lunarcrush",
  "peec",
  "sprouts",
  "gamma",
  "godaddy",
  "shopify_mcp",
  "twilio_mcp",
] as const satisfies readonly IntelligencePlatform[];

const MCP_PROVIDER_META: Record<IntelligencePlatform, McpProviderMeta> = {
  dayai: { platform: "dayai", auth: "oauth", credentialLabel: "OAuth" },
  windsor: { platform: "windsor", auth: "oauth", credentialLabel: "OAuth" },
  era: { platform: "era", auth: "oauth", credentialLabel: "OAuth" },
  ahrefs: { platform: "ahrefs", auth: "oauth", credentialLabel: "OAuth" },
  canva_mcp: { platform: "canva_mcp", auth: "oauth", credentialLabel: "OAuth" },
  superhuman_mcp: { platform: "superhuman_mcp", auth: "oauth", credentialLabel: "OAuth" },
  supermetrics_mcp: { platform: "supermetrics_mcp", auth: "oauth", credentialLabel: "OAuth" },
  exa: {
    platform: "exa",
    auth: "api_key",
    credentialLabel: "API key",
    credentialPlaceholder: "Paste your Exa API key",
  },
  klarity: {
    platform: "klarity",
    auth: "api_key",
    credentialLabel: "API key",
    credentialPlaceholder: "Klarity Architect API token",
  },
  lunarcrush: {
    platform: "lunarcrush",
    auth: "api_key",
    credentialLabel: "API key",
    credentialPlaceholder: "LunarCrush API key",
  },
  peec: {
    platform: "peec",
    auth: "api_key",
    credentialLabel: "API key",
    credentialPlaceholder: "Peec AI API key",
  },
  sprouts: {
    platform: "sprouts",
    auth: "api_key",
    credentialLabel: "API key (optional)",
    credentialPlaceholder: "Leave empty for keyless connect",
  },
  gamma: {
    platform: "gamma",
    auth: "api_key",
    credentialLabel: "API key",
    credentialPlaceholder: "Gamma API key",
  },
  godaddy: {
    platform: "godaddy",
    auth: "api_key",
    credentialLabel: "API key",
    credentialPlaceholder: "KEY:SECRET from developer.godaddy.com",
  },
  shopify_mcp: {
    platform: "shopify_mcp",
    auth: "shop_domain",
    credentialLabel: "Shop domain",
    credentialPlaceholder: "mystore.myshopify.com",
  },
  twilio_mcp: {
    platform: "twilio_mcp",
    auth: "keyless",
    credentialLabel: "None",
  },
};

export function isMcpPlatform(platform: string): platform is IntelligencePlatform {
  return platform in MCP_PROVIDER_META;
}

export function getMcpProviderMeta(platform: string): McpProviderMeta | null {
  if (!isMcpPlatform(platform)) return null;
  return MCP_PROVIDER_META[platform];
}

export function buildMcpOAuthConnectUrl(platform: IntelligencePlatform, businessProfileId: string): string {
  return buildConnectUrl(`mcp/${platform}`, businessProfileId);
}

/** API path (not full URL) — pass to apiJson, which applies the API origin. */
export function mcpManualConnectPath(platform: IntelligencePlatform): string {
  return `/api/auth/mcp/${platform}/manual-connect`;
}
