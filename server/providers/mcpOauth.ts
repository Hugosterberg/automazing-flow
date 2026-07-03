/**
 * OAuth-secured remote MCP servers (MCP-spec authorization).
 *
 * These providers use authorization_code + PKCE with dynamic client
 * registration (RFC 7591) — the server registers its own OAuth client per
 * redirect URI, so no pre-provisioned client id is required. Env overrides
 * (<PLATFORM>_CLIENT_ID / <PLATFORM>_CLIENT_SECRET, e.g. DAYAI_CLIENT_ID)
 * win when present.
 *
 * Discovery endpoints verified 2026-07-02 via
 * /.well-known/oauth-authorization-server on each host.
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

export type OauthMcpPlatform =
  | "dayai"
  | "windsor"
  | "era"
  | "ahrefs"
  | "canva_mcp"
  | "superhuman_mcp"
  | "supermetrics_mcp";

export interface OauthMcpDescriptor {
  platform: OauthMcpPlatform;
  label: string;
  mcpUrl: string;
  authUrl: string;
  tokenUrl: string;
  registerUrl: string;
  /** Space-separated scopes; empty = let the server apply its defaults. */
  scopes: string;
  profileUrl: string;
  /** Prefix for env overrides, e.g. "DAYAI" → DAYAI_CLIENT_ID. */
  envPrefix: string;
}

export const OAUTH_MCP_DIRECTORY: Record<OauthMcpPlatform, OauthMcpDescriptor> = {
  dayai: {
    platform: "dayai",
    label: "Day.ai",
    mcpUrl: "https://day.ai/api/mcp",
    authUrl: "https://day.ai/integrations/authorize",
    tokenUrl: "https://day.ai/api/oauth",
    registerUrl: "https://day.ai/api/oauth/register",
    scopes: "native_organization:write native_contact:write assistant:*:use",
    profileUrl: "https://day.ai",
    envPrefix: "DAYAI",
  },
  windsor: {
    platform: "windsor",
    label: "Windsor.ai",
    mcpUrl: "https://mcp.windsor.ai/",
    authUrl: "https://mcp.windsor.ai/authorize",
    tokenUrl: "https://mcp.windsor.ai/token",
    registerUrl: "https://mcp.windsor.ai/register",
    scopes: "",
    profileUrl: "https://windsor.ai",
    envPrefix: "WINDSOR",
  },
  era: {
    platform: "era",
    label: "Era",
    mcpUrl: "https://context.era.app/mcp",
    authUrl: "https://forge.era.app/oauth/authorize",
    tokenUrl: "https://forge.era.app/oauth/token",
    registerUrl: "https://forge.era.app/oauth/register",
    scopes: "",
    profileUrl: "https://era.app",
    envPrefix: "ERA",
  },
  ahrefs: {
    platform: "ahrefs",
    label: "Ahrefs",
    mcpUrl: "https://api.ahrefs.com/mcp/mcp",
    authUrl: "https://app.ahrefs.com/web/oauth/authorize",
    tokenUrl: "https://ahrefs.com/oauth/token",
    registerUrl: "https://api.ahrefs.com/mcp/register",
    scopes: "apiv3-mcp",
    profileUrl: "https://ahrefs.com",
    envPrefix: "AHREFS",
  },
  // Distinct from the existing "canva" Connect-REST integration (design
  // export). The MCP surface has its own OAuth issuer and broader tools;
  // both can be connected side by side.
  canva_mcp: {
    platform: "canva_mcp",
    label: "Canva MCP",
    mcpUrl: "https://mcp.canva.com/mcp",
    authUrl: "https://mcp.canva.com/authorize",
    tokenUrl: "https://mcp.canva.com/token",
    registerUrl: "https://mcp.canva.com/register",
    scopes: "",
    profileUrl: "https://canva.com",
    envPrefix: "CANVA_MCP",
  },
  superhuman_mcp: {
    platform: "superhuman_mcp",
    label: "Superhuman Mail",
    mcpUrl: "https://mcp.mail.superhuman.com/mcp",
    authUrl: "https://mcp.auth.mail.superhuman.com/oauth2/authorize",
    tokenUrl: "https://mcp.auth.mail.superhuman.com/oauth2/token",
    registerUrl: "https://mcp.auth.mail.superhuman.com/oauth2/register",
    scopes: "openid email profile offline_access",
    profileUrl: "https://mail.superhuman.com",
    envPrefix: "SUPERHUMAN_MCP",
  },
  supermetrics_mcp: {
    platform: "supermetrics_mcp",
    label: "Supermetrics",
    mcpUrl: "https://mcp.supermetrics.com/mcp",
    authUrl: "https://api.supermetrics.com/oauth/authorize",
    tokenUrl: "https://api.supermetrics.com/oauth/token",
    registerUrl: "https://api.supermetrics.com/oauth/register",
    scopes:
      "openid offline_access email profile team_read user_read ds_logins_read ds_accounts_read ds_queries_run",
    profileUrl: "https://supermetrics.com",
    envPrefix: "SUPERMETRICS_MCP",
  },
};

export function isOauthMcpPlatform(value: string): value is OauthMcpPlatform {
  return value in OAUTH_MCP_DIRECTORY;
}

export type McpOauthTokenResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      scope?: string;
    }
  | { ok: false; status: number; message: string };

export type McpOauthClientRegistration =
  | { ok: true; clientId: string; clientSecret: string }
  | { ok: false; status: number; message: string };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => ({}))) || {}) as Record<string, unknown>;
}

/** Register an OAuth client dynamically (RFC 7591; both providers allow unauthenticated registration). */
export async function registerMcpOauthClient(
  descriptor: OauthMcpDescriptor,
  options: { redirectUri: string }
): Promise<McpOauthClientRegistration> {
  const response = await fetch(descriptor.registerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "automazing",
      client_uri: "https://automazing.life",
      redirect_uris: [options.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.client_id) {
    return {
      ok: false,
      status: response.status,
      message: String(
        payload.error_description || payload.error || `${descriptor.label} client registration failed.`
      ),
    };
  }
  return {
    ok: true,
    clientId: String(payload.client_id),
    clientSecret: String(payload.client_secret || ""),
  };
}

async function requestMcpOauthToken(
  descriptor: OauthMcpDescriptor,
  body: URLSearchParams
): Promise<McpOauthTokenResult> {
  const response = await fetch(descriptor.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    return {
      ok: false,
      status: response.status,
      message: String(
        payload.error_description || payload.error || `${descriptor.label} token request failed.`
      ),
    };
  }
  return {
    ok: true,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : undefined,
    expiresIn: Number.isFinite(Number(payload.expires_in)) ? Number(payload.expires_in) : undefined,
    scope: payload.scope ? String(payload.scope) : undefined,
  };
}

export async function exchangeMcpOauthCode(
  descriptor: OauthMcpDescriptor,
  options: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }
): Promise<McpOauthTokenResult> {
  // token_endpoint_auth_method client_secret_post → credentials in the body.
  return requestMcpOauthToken(
    descriptor,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: options.code,
      code_verifier: options.codeVerifier,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      client_secret: options.clientSecret,
    })
  );
}

export async function refreshMcpOauthToken(
  descriptor: OauthMcpDescriptor,
  options: { clientId: string; clientSecret: string; refreshToken: string }
): Promise<McpOauthTokenResult> {
  return requestMcpOauthToken(
    descriptor,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: options.refreshToken,
      client_id: options.clientId,
      client_secret: options.clientSecret,
    })
  );
}

function bearerHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function connectOauthMcp(
  platform: OauthMcpPlatform,
  accessToken: string
): Promise<McpResult<{ handle: McpServerHandle }>> {
  const descriptor = OAUTH_MCP_DIRECTORY[platform];
  return connectMcp({ endpoint: descriptor.mcpUrl, headers: bearerHeaders(accessToken) });
}

export async function listOauthMcpTools(
  platform: OauthMcpPlatform,
  accessToken: string
): Promise<McpResult<{ tools: McpToolDescriptor[] }>> {
  const conn = await connectOauthMcp(platform, accessToken);
  if (conn.ok === false) {
    return { ok: false, status: conn.status, message: conn.message };
  }
  return listMcpTools(conn.handle);
}

export async function callOauthMcpTool(
  platform: OauthMcpPlatform,
  accessToken: string,
  name: string,
  args: Record<string, unknown>
): Promise<McpResult<McpToolCallOutput>> {
  const conn = await connectOauthMcp(platform, accessToken);
  if (conn.ok === false) {
    return { ok: false, status: conn.status, message: conn.message };
  }
  return callMcpTool(conn.handle, name, args);
}
