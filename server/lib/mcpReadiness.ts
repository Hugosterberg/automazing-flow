/**
 * Assess whether a connected MCP account can make tool calls — without every
 * feature re-implementing "is there a key?", "did OAuth expire?", etc.
 */

import {
  isKeyedMcpPlatform,
  KEYED_MCP_DIRECTORY,
  keyedMcpCredentialFromStored,
} from "../providers/mcpDirectory.ts";
import { isOauthMcpPlatform } from "../providers/mcpOauth.ts";
import {
  findMcpAccountForProfile,
  freshOauthAccessTokenForStored,
  listToolsForStored,
  type StoredMcpAccount,
} from "./mcpAccess.ts";
import { allMcpCatalogEntries, mcpCatalogEntry, type McpCatalogEntry } from "./mcpCatalog.ts";

export type McpProviderStatus =
  | "not_connected"
  | "missing_credential"
  | "auth_expired"
  | "ready"
  | "error";

export interface McpProviderReadiness {
  platform: string;
  label: string;
  auth: McpCatalogEntry["auth"];
  keyOptional: boolean;
  credentialHint: string;
  usedBy: string[];
  status: McpProviderStatus;
  message?: string;
  accountId?: string;
  username?: string;
  toolCount?: number;
}

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

function credentialMissing(stored: StoredMcpAccount, entry: McpCatalogEntry): string | null {
  if (entry.auth === "keyless" || entry.keyOptional) return null;
  if (entry.auth === "shop_domain") {
    const shop = String(stored.mcpShopDomain || "").trim();
    return shop ? null : "Shop domain is missing — reconnect and enter your .myshopify.com domain.";
  }
  if (entry.auth === "api_key") {
    const key = String(stored.mcpApiKey || "").trim();
    return key ? null : "API key is missing — reconnect and paste your key.";
  }
  if (entry.auth === "oauth") {
    const access = String(stored.accessToken || "").trim();
    const refresh = String(stored.refreshToken || "").trim();
    if (!access && !refresh) {
      return "OAuth tokens are missing — reconnect this provider.";
    }
    const expiresAt = stored.expiresAt ? Date.parse(String(stored.expiresAt)) : NaN;
    if (access && Number.isFinite(expiresAt) && expiresAt <= Date.now() && !refresh) {
      return "Access token expired and no refresh token is stored — reconnect.";
    }
  }
  return null;
}

export async function assessMcpAccount(
  tokenStore: TokenStoreLike,
  stored: StoredMcpAccount,
  options?: { probe?: boolean }
): Promise<{ status: McpProviderStatus; message?: string; toolCount?: number }> {
  const platform = String(stored.platform || "");
  const entry = mcpCatalogEntry(platform);
  if (!entry) {
    return { status: "error", message: "Unknown MCP platform." };
  }

  const missing = credentialMissing(stored, entry);
  if (missing) {
    return {
      status: entry.auth === "oauth" && missing.includes("expired") ? "auth_expired" : "missing_credential",
      message: missing,
    };
  }

  if (entry.auth === "oauth") {
    const token = await freshOauthAccessTokenForStored(tokenStore, stored);
    if (token.ok === false) {
      return {
        status: token.status === 401 ? "auth_expired" : "error",
        message: token.message,
      };
    }
  }

  if (!options?.probe) {
    return { status: "ready" };
  }

  const tools = await listToolsForStored(tokenStore, stored);
  if (tools.ok === false) {
    return { status: "error", message: tools.message };
  }
  return { status: "ready", toolCount: tools.tools.length };
}

export async function buildMcpProvidersReadiness(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  probe?: boolean;
}): Promise<McpProviderReadiness[]> {
  const { tokenStore, businessProfileId, probe = false } = options;
  const rows = await tokenStore.entries();
  const results: McpProviderReadiness[] = [];

  for (const entry of allMcpCatalogEntries()) {
    let account: StoredMcpAccount | null = null;
    for (const [accountId, stored] of rows) {
      if (!stored || String(stored.platform || "") !== entry.platform) continue;
      if (businessProfileId && String(stored.profileId || "") !== businessProfileId) continue;
      account = { ...stored, __accountId: accountId };
      break;
    }

    if (!account) {
      results.push({
        platform: entry.platform,
        label: entry.label,
        auth: entry.auth,
        keyOptional: entry.keyOptional,
        credentialHint: entry.credentialHint,
        usedBy: entry.usedBy,
        status: "not_connected",
        message:
          entry.usedBy.length > 0
            ? `Not connected — ${entry.auth === "oauth" ? "OAuth required" : entry.auth === "keyless" ? "click Connect" : "API key required"} for ${entry.usedBy[0]}.`
            : undefined,
      });
      continue;
    }

    const assessed = await assessMcpAccount(tokenStore, account, { probe });
    results.push({
      platform: entry.platform,
      label: entry.label,
      auth: entry.auth,
      keyOptional: entry.keyOptional,
      credentialHint: entry.credentialHint,
      usedBy: entry.usedBy,
      status: assessed.status,
      message: assessed.message,
      accountId: account.__accountId,
      username: String(account.username || account.displayName || ""),
      toolCount: assessed.toolCount,
    });
  }

  return results;
}

export async function findReadyMcpAccount(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  platforms: string[];
}): Promise<
  | { ok: true; account: StoredMcpAccount; entry: McpCatalogEntry }
  | { ok: false; status: number; error: string; missingPlatforms: string[] }
> {
  const missing: string[] = [];
  for (const platform of options.platforms) {
    const entry = mcpCatalogEntry(platform);
    if (!entry) continue;
    const account = await findMcpAccountForProfile({
      tokenStore: options.tokenStore,
      businessProfileId: options.businessProfileId,
      platforms: [platform],
    });
    if (!account) {
      missing.push(platform);
      continue;
    }
    const assessed = await assessMcpAccount(options.tokenStore, account, { probe: false });
    if (assessed.status === "ready") {
      return { ok: true, account, entry };
    }
    if (assessed.status === "missing_credential" || assessed.status === "auth_expired") {
      return {
        ok: false,
        status: 409,
        error: assessed.message || `${entry.label} is connected but not configured for API calls.`,
        missingPlatforms: [platform],
      };
    }
    missing.push(platform);
  }

  const labels = options.platforms
    .map((p) => mcpCatalogEntry(p)?.label || p)
    .join(" or ");
  return {
    ok: false,
    status: 409,
    error: `No ${labels} connection with valid credentials. Connect under Connections → Intelligence & MCP.`,
    missingPlatforms: missing,
  };
}
