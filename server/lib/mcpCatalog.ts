/**
 * Product-facing MCP catalog — which providers exist, how they auth, and
 * which automazing features consume them.
 */

import { KEYED_MCP_DIRECTORY, type KeyedMcpPlatform } from "../providers/mcpDirectory.ts";
import { OAUTH_MCP_DIRECTORY, type OauthMcpPlatform } from "../providers/mcpOauth.ts";

export type McpAuthKind = "oauth" | "api_key" | "shop_domain" | "keyless";

export interface McpCatalogEntry {
  platform: string;
  label: string;
  auth: McpAuthKind;
  keyOptional: boolean;
  credentialHint: string;
  /** Human-readable features that call this provider (empty = connect-only for now). */
  usedBy: string[];
}

const KEYED_AUTH: Record<KeyedMcpPlatform, McpAuthKind> = {
  exa: "api_key",
  klarity: "api_key",
  lunarcrush: "api_key",
  peec: "api_key",
  sprouts: "api_key",
  gamma: "api_key",
  godaddy: "api_key",
  shopify_mcp: "shop_domain",
  twilio_mcp: "keyless",
};

const FEATURE_USAGE: Record<string, string[]> = {
  lunarcrush: ["Market pulse (home dashboard)"],
  exa: ["Lead research (Sales)", "Doc search (Connections)"],
  sprouts: ["Lead research (Sales, fallback)"],
  ahrefs: ["SEO overview (Marketing)"],
  supermetrics_mcp: ["Marketing data queries (Marketing)"],
  windsor: ["Marketing data queries (Marketing, fallback)"],
  twilio_mcp: ["Developer doc search (Connections)"],
  peec: ["Competitive research (Marketing)"],
  dayai: ["CRM assistant (Customers)"],
  superhuman_mcp: ["Mail search (Messages)"],
  era: ["Context tools (Connections)"],
  canva_mcp: ["Design automation (Content)"],
  gamma: ["Deck generation (Content)"],
  shopify_mcp: ["Storefront catalog (Ecommerce)"],
  godaddy: ["Domain lookup (Connections)"],
  klarity: ["Architecture docs (Connections)"],
};

export const ALL_MCP_PLATFORMS: string[] = [
  ...Object.keys(OAUTH_MCP_DIRECTORY),
  ...Object.keys(KEYED_MCP_DIRECTORY),
];

export function mcpCatalogEntry(platform: string): McpCatalogEntry | null {
  if (platform in OAUTH_MCP_DIRECTORY) {
    const d = OAUTH_MCP_DIRECTORY[platform as OauthMcpPlatform];
    return {
      platform,
      label: d.label,
      auth: "oauth",
      keyOptional: false,
      credentialHint: `OAuth — optional env: ${d.envPrefix}_CLIENT_ID`,
      usedBy: FEATURE_USAGE[platform] ?? [],
    };
  }
  if (platform in KEYED_MCP_DIRECTORY) {
    const d = KEYED_MCP_DIRECTORY[platform as KeyedMcpPlatform];
    return {
      platform,
      label: d.label,
      auth: KEYED_AUTH[platform as KeyedMcpPlatform],
      keyOptional: Boolean(d.keyOptional),
      credentialHint: d.keyHint,
      usedBy: FEATURE_USAGE[platform] ?? [],
    };
  }
  return null;
}

export function allMcpCatalogEntries(): McpCatalogEntry[] {
  return ALL_MCP_PLATFORMS.map((p) => mcpCatalogEntry(p)).filter(Boolean) as McpCatalogEntry[];
}

/** Platform preference lists for intelligence routes (first connected wins). */
export const MCP_FEATURE_PLATFORMS = {
  marketPulse: ["lunarcrush"],
  leadResearch: ["exa", "sprouts"],
  docSearch: ["twilio_mcp", "exa"],
  seoOverview: ["ahrefs"],
  marketingQuery: ["supermetrics_mcp", "windsor"],
  competitiveResearch: ["peec"],
  mailSearch: ["superhuman_mcp"],
  domainLookup: ["godaddy"],
  architectureDocs: ["klarity"],
  deckGeneration: ["gamma"],
  shopCatalog: ["shopify_mcp"],
  crmQuery: ["dayai"],
  contextQuery: ["era"],
  designAssist: ["canva_mcp"],
} as const;
