/**
 * Directory of API-key based remote MCP servers automazing can consume.
 *
 * Each entry describes where the server lives and how its key travels
 * (query param vs Authorization header). The generic helpers below give
 * every keyed provider list/call support through server/lib/mcpClient.ts —
 * adding the next provider is one descriptor, no new plumbing.
 *
 * Day.ai is NOT here: it uses full MCP OAuth (see providers/dayai.ts).
 */

import {
  connectMcp,
  listMcpTools,
  callMcpTool,
  type McpResult,
  type McpServerHandle,
  type McpToolDescriptor,
  type McpToolCallOutput,
} from "../lib/mcpClient.ts";
import { normalizeShopifyShopDomain, shopifyStorefrontMcpUrl } from "../lib/shopifyShopDomain.ts";

export type KeyedMcpPlatform =
  | "exa"
  | "klarity"
  | "lunarcrush"
  | "peec"
  | "sprouts"
  | "gamma"
  | "godaddy"
  | "shopify_mcp"
  | "twilio_mcp";

export interface KeyedMcpDescriptor {
  platform: KeyedMcpPlatform;
  label: string;
  mcpUrl: string;
  /** How the API key is attached to requests. */
  keyPlacement:
    | { type: "query"; param: string }
    | { type: "bearer" }
    | { type: "header"; header: string; prefix: string }
    /** Per-store Shopify Storefront MCP — credential is the shop domain. */
    | { type: "shop_domain" };
  /** Where the user finds their key — shown in connect UI errors/help. */
  keyHint: string;
  profileUrl: string;
  /** Server accepts unauthenticated calls; a key only unlocks more. */
  keyOptional?: boolean;
}

export const KEYED_MCP_DIRECTORY: Record<KeyedMcpPlatform, KeyedMcpDescriptor> = {
  exa: {
    platform: "exa",
    label: "Exa",
    mcpUrl: "https://mcp.exa.ai/mcp",
    keyPlacement: { type: "query", param: "exaApiKey" },
    keyHint: "dashboard.exa.ai → API Keys",
    profileUrl: "https://exa.ai",
  },
  klarity: {
    platform: "klarity",
    label: "Klarity Architect",
    mcpUrl: "https://architect-v2-api.klarity.ai/mcp",
    keyPlacement: { type: "bearer" },
    keyHint: "Klarity Architect → settings → API access",
    profileUrl: "https://klarity.ai",
  },
  lunarcrush: {
    platform: "lunarcrush",
    label: "LunarCrush",
    mcpUrl: "https://lunarcrush.ai/mcp",
    keyPlacement: { type: "query", param: "key" },
    keyHint: "lunarcrush.com → account → API",
    profileUrl: "https://lunarcrush.com",
  },
  peec: {
    platform: "peec",
    label: "Peec AI",
    mcpUrl: "https://api.peec.ai/mcp",
    keyPlacement: { type: "bearer" },
    keyHint: "app.peec.ai → settings → API",
    profileUrl: "https://peec.ai",
  },
  sprouts: {
    platform: "sprouts",
    label: "Sprouts Data Intelligence",
    // Community/vendor worker deployment — MCP endpoint is the root path.
    mcpUrl: "https://sprouts-mcp-server.kartikay-dhar.workers.dev/",
    keyPlacement: { type: "bearer" },
    keyHint: "sprouts.ai — API key optional; server accepts keyless connects",
    profileUrl: "https://sprouts.ai",
    keyOptional: true,
  },
  gamma: {
    platform: "gamma",
    label: "Gamma",
    mcpUrl: "https://mcp.gamma.app/mcp",
    keyPlacement: { type: "bearer" },
    keyHint: "gamma.app → Account settings → API keys",
    profileUrl: "https://gamma.app",
  },
  godaddy: {
    platform: "godaddy",
    label: "GoDaddy Domains",
    mcpUrl: "https://api.godaddy.com/v1/domains/mcp",
    // GoDaddy API auth format: "sso-key KEY:SECRET" — paste "KEY:SECRET".
    keyPlacement: { type: "header", header: "Authorization", prefix: "sso-key " },
    keyHint: "developer.godaddy.com → API Keys (paste as KEY:SECRET)",
    profileUrl: "https://godaddy.com",
    keyOptional: true,
  },
  shopify_mcp: {
    platform: "shopify_mcp",
    label: "Shopify Storefront MCP",
    // Resolved per shop at connect time — each store exposes /api/mcp publicly.
    mcpUrl: "https://{shop}.myshopify.com/api/mcp",
    keyPlacement: { type: "shop_domain" },
    keyHint: "Shop domain (e.g. mystore.myshopify.com) — see setup.shopify.com/mcp",
    profileUrl: "https://setup.shopify.com/mcp",
  },
  twilio_mcp: {
    platform: "twilio_mcp",
    label: "Twilio Docs MCP",
    mcpUrl: "https://mcp.twilio.com/docs",
    keyPlacement: { type: "bearer" },
    keyHint: "No API key required — public Twilio documentation search",
    profileUrl: "https://www.twilio.com/docs/ai/mcp",
    keyOptional: true,
  },
};

export function isKeyedMcpPlatform(value: string): value is KeyedMcpPlatform {
  return value in KEYED_MCP_DIRECTORY;
}

function keyedEndpointAndHeaders(
  descriptor: KeyedMcpDescriptor,
  credential: string
): { endpoint: string; headers: Record<string, string> } {
  if (descriptor.keyPlacement.type === "shop_domain") {
    const shop = normalizeShopifyShopDomain(credential);
    if (!shop) return { endpoint: descriptor.mcpUrl, headers: {} };
    return { endpoint: shopifyStorefrontMcpUrl(shop), headers: {} };
  }
  if (!credential) return { endpoint: descriptor.mcpUrl, headers: {} };
  const placement = descriptor.keyPlacement;
  if (placement.type === "query") {
    const url = new URL(descriptor.mcpUrl);
    url.searchParams.set(placement.param, credential);
    return { endpoint: url.toString(), headers: {} };
  }
  if (placement.type === "header") {
    return { endpoint: descriptor.mcpUrl, headers: { [placement.header]: `${placement.prefix}${credential}` } };
  }
  return { endpoint: descriptor.mcpUrl, headers: { Authorization: `Bearer ${credential}` } };
}

export async function connectKeyedMcp(
  platform: KeyedMcpPlatform,
  credential: string
): Promise<McpResult<{ handle: McpServerHandle }>> {
  const descriptor = KEYED_MCP_DIRECTORY[platform];
  return connectMcp(keyedEndpointAndHeaders(descriptor, credential));
}

export async function listKeyedMcpTools(
  platform: KeyedMcpPlatform,
  credential: string
): Promise<McpResult<{ tools: McpToolDescriptor[] }>> {
  const conn = await connectKeyedMcp(platform, credential);
  if (conn.ok === false) {
    return { ok: false, status: conn.status, message: conn.message };
  }
  return listMcpTools(conn.handle);
}

export async function callKeyedMcpTool(
  platform: KeyedMcpPlatform,
  credential: string,
  name: string,
  args: Record<string, unknown>
): Promise<McpResult<McpToolCallOutput>> {
  const conn = await connectKeyedMcp(platform, credential);
  if (conn.ok === false) {
    return { ok: false, status: conn.status, message: conn.message };
  }
  return callMcpTool(conn.handle, name, args);
}

/** Resolve the stored credential for a keyed MCP account row. */
export function keyedMcpCredentialFromStored(stored: Record<string, unknown>): string {
  return String(stored.mcpShopDomain || stored.mcpApiKey || "");
}
