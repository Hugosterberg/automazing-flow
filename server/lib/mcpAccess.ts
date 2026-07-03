/**
 * Tenant-level access to connected MCP servers.
 *
 * Product features (Market pulse, lead research, daily brief signals, …)
 * shouldn't re-implement "find the tenant's LunarCrush account, refresh its
 * token, guess which tool to call". This module owns that:
 *
 *   findMcpAccountForProfile()  — first connected account for a platform list
 *   listToolsForStored()        — tools/list for a stored account (any kind)
 *   callToolForStored()         — tools/call for a stored account (any kind)
 *   pickTool()                  — choose a tool by name pattern, safely
 *
 * OAuth token refresh is transparent and persisted back to the token store.
 * Everything returns McpResult-style unions — feature routes decide how
 * quiet or loud a failure should be (dashboards stay quiet, actions report).
 */

import {
  isKeyedMcpPlatform,
  listKeyedMcpTools,
  callKeyedMcpTool,
  keyedMcpCredentialFromStored,
  type KeyedMcpPlatform,
} from "../providers/mcpDirectory.ts";
import {
  OAUTH_MCP_DIRECTORY,
  isOauthMcpPlatform,
  refreshMcpOauthToken,
  listOauthMcpTools,
  callOauthMcpTool,
  type OauthMcpPlatform,
} from "../providers/mcpOauth.ts";
import { accountInBusinessProfile } from "./profileScope.ts";
import type { McpResult, McpToolDescriptor, McpToolCallOutput } from "./mcpClient.ts";

export type StoredMcpAccount = Record<string, unknown> & { __accountId: string };

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

export function isMcpPlatform(value: string): value is KeyedMcpPlatform | OauthMcpPlatform {
  return isKeyedMcpPlatform(value) || isOauthMcpPlatform(value);
}

/**
 * First connected MCP account on any of `platforms` that belongs to the
 * business profile (platform order = preference order).
 */
export async function findMcpAccountForProfile(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  platforms: string[];
}): Promise<StoredMcpAccount | null> {
  const { tokenStore, businessProfileId, platforms } = options;
  const rows = await tokenStore.entries();
  for (const platform of platforms) {
    if (!isMcpPlatform(platform)) continue;
    for (const [accountId, stored] of rows) {
      if (!stored || String(stored.platform || "") !== platform) continue;
      if (!accountInBusinessProfile(stored, businessProfileId)) continue;
      return { ...stored, __accountId: accountId };
    }
  }
  return null;
}

/**
 * Valid access token for an OAuth MCP account, refreshing + persisting when
 * the stored one has expired. Mirrors the per-request logic in mcpRoutes.
 */
export async function freshOauthAccessTokenForStored(
  tokenStore: TokenStoreLike,
  stored: StoredMcpAccount
): Promise<{ ok: true; accessToken: string } | { ok: false; status: number; message: string }> {
  const platform = String(stored.platform || "");
  if (!isOauthMcpPlatform(platform)) {
    return { ok: false, status: 400, message: "Not an OAuth MCP account." };
  }
  const accessToken = String(stored.accessToken || "");
  const expiresAt = stored.expiresAt ? Date.parse(String(stored.expiresAt)) : NaN;
  const stillValid = accessToken && (!Number.isFinite(expiresAt) || expiresAt - Date.now() > 60_000);
  if (stillValid) return { ok: true, accessToken };

  const refreshToken = String(stored.refreshToken || "");
  if (!refreshToken) {
    return { ok: false, status: 401, message: "Access token expired; reconnect the account." };
  }
  const descriptor = OAUTH_MCP_DIRECTORY[platform];
  const clientRecord = await tokenStore.get(`mcp_oauth_client:${platform}`);
  const clientId =
    String(process.env[`${descriptor.envPrefix}_CLIENT_ID`] || "").trim() ||
    String(clientRecord?.clientId || "");
  const clientSecret =
    String(process.env[`${descriptor.envPrefix}_CLIENT_SECRET`] || "").trim() ||
    String(clientRecord?.clientSecret || "");
  if (!clientId) {
    return { ok: false, status: 401, message: "OAuth client credentials are missing; reconnect the account." };
  }
  const refreshed = await refreshMcpOauthToken(descriptor, { clientId, clientSecret, refreshToken });
  if (refreshed.ok === false) {
    return { ok: false, status: refreshed.status === 0 ? 502 : 401, message: refreshed.message };
  }
  const { __accountId, ...persistable } = stored;
  await tokenStore.set(__accountId, {
    ...persistable,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || refreshToken,
    expiresAt: refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
      : undefined,
  });
  return { ok: true, accessToken: refreshed.accessToken };
}

export async function listToolsForStored(
  tokenStore: TokenStoreLike,
  stored: StoredMcpAccount
): Promise<McpResult<{ tools: McpToolDescriptor[] }>> {
  const platform = String(stored.platform || "");
  if (isKeyedMcpPlatform(platform)) {
    return listKeyedMcpTools(platform, keyedMcpCredentialFromStored(stored));
  }
  if (isOauthMcpPlatform(platform)) {
    const token = await freshOauthAccessTokenForStored(tokenStore, stored);
    if (token.ok === false) return token;
    return listOauthMcpTools(platform, token.accessToken);
  }
  return { ok: false, status: 400, message: `Not an MCP platform: ${platform}` };
}

export async function callToolForStored(
  tokenStore: TokenStoreLike,
  stored: StoredMcpAccount,
  name: string,
  args: Record<string, unknown>
): Promise<McpResult<McpToolCallOutput>> {
  const platform = String(stored.platform || "");
  if (isKeyedMcpPlatform(platform)) {
    return callKeyedMcpTool(platform, keyedMcpCredentialFromStored(stored), name, args);
  }
  if (isOauthMcpPlatform(platform)) {
    const token = await freshOauthAccessTokenForStored(tokenStore, stored);
    if (token.ok === false) return token;
    return callOauthMcpTool(platform, token.accessToken, name, args);
  }
  return { ok: false, status: 400, message: `Not an MCP platform: ${platform}` };
}

/**
 * Pick the best-matching tool from a server's tool list. Patterns are tried
 * in order; the first tool whose name matches wins. Vendors name tools
 * differently ("Topic", "get_topic", "search_web") so features pass a small
 * preference list instead of hardcoding one name.
 */
export function pickTool(
  tools: McpToolDescriptor[],
  patterns: RegExp[]
): McpToolDescriptor | null {
  for (const pattern of patterns) {
    const hit = tools.find((tool) => pattern.test(tool.name));
    if (hit) return hit;
  }
  return null;
}
