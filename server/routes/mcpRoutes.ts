/**
 * Remote MCP integrations — account-scoped tool access.
 *
 * automazing consumes remote MCP servers as data providers (Day.ai CRM,
 * Exa search, LunarCrush crypto sentiment, …). This module exposes:
 *
 *   POST /api/auth/mcp/:platform/manual-connect  — connect an API-key server
 *   GET  /api/mcp/:accountId/tools               — list the server's tools
 *   POST /api/mcp/:accountId/call                — call one tool
 *
 * OAuth-secured MCP providers connect via /api/auth/mcp/:platform in
 * oauthRoutes.ts; once connected, both kinds are served here. Access tokens
 * for OAuth providers are refreshed transparently when expired.
 */

import { profileScopedAccountId, pruneDuplicateAccountEntries } from "../lib/accountIdentity.ts";
import {
  KEYED_MCP_DIRECTORY,
  isKeyedMcpPlatform,
  connectKeyedMcp,
  listKeyedMcpTools,
  callKeyedMcpTool,
  keyedMcpCredentialFromStored,
} from "../providers/mcpDirectory.ts";
import { normalizeShopifyShopDomain, shopifyStorefrontMcpUrl } from "../lib/shopifyShopDomain.ts";
import {
  OAUTH_MCP_DIRECTORY,
  isOauthMcpPlatform,
  refreshMcpOauthToken,
  listOauthMcpTools,
  callOauthMcpTool,
  type OauthMcpPlatform,
} from "../providers/mcpOauth.ts";

interface TokenStore {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
  delete: (id: string) => Promise<unknown>;
}

interface McpRoutesDeps {
  tokenStore: TokenStore;
  getSessionUserId: (req: unknown) => string | null;
  getStoredAccountAccess: (
    stored: Record<string, unknown> | null | undefined,
    userId: string
  ) => { allowed: boolean; migrate: boolean; reason: string };
}

/** Max characters of tool output returned to the client per call. */
const MAX_TOOL_OUTPUT_CHARS = 200_000;

export function registerMcpRoutes(app, deps: McpRoutesDeps) {
  const { tokenStore, getSessionUserId, getStoredAccountAccess } = deps;

  /**
   * Load a stored MCP account the session user may use. Returns null after
   * responding with the appropriate error.
   */
  async function requireMcpAccount(req, res): Promise<Record<string, unknown> | null> {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    const accountId = String(req.params.accountId || "").trim();
    const stored = accountId ? await tokenStore.get(accountId) : null;
    const platform = String(stored?.platform || "");
    if (!stored || (!isKeyedMcpPlatform(platform) && !isOauthMcpPlatform(platform))) {
      res.status(404).json({ error: "MCP account not found" });
      return null;
    }
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      res.status(403).json({ error: "Account belongs to another user" });
      return null;
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    return { ...stored, __accountId: accountId };
  }

  /**
   * A valid access token for an OAuth MCP account, refreshing (and
   * persisting) when the stored one has expired.
   */
  async function freshOauthAccessToken(
    stored: Record<string, unknown>
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
      return { ok: false, status: 401, message: "Access token expired and no refresh token is stored. Reconnect the account." };
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
      return { ok: false, status: 401, message: "OAuth client credentials are missing. Reconnect the account." };
    }

    const refreshed = await refreshMcpOauthToken(descriptor, { clientId, clientSecret, refreshToken });
    if (refreshed.ok === false) {
      return { ok: false, status: refreshed.status === 0 ? 502 : 401, message: refreshed.message };
    }

    const accountId = String(stored.__accountId || "");
    if (accountId) {
      const { __accountId: _ignored, ...persistable } = stored;
      await tokenStore.set(accountId, {
        ...persistable,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || refreshToken,
        expiresAt: refreshed.expiresIn
          ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
          : undefined,
      });
    }
    return { ok: true, accessToken: refreshed.accessToken };
  }

  // --- Connect an API-key MCP server -------------------------------------

  app.post("/api/auth/mcp/:platform/manual-connect", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const platform = String(req.params.platform || "").toLowerCase();
    if (!isKeyedMcpPlatform(platform)) {
      return res.status(400).json({ error: `No API-key MCP provider named "${platform}".` });
    }
    const descriptor = KEYED_MCP_DIRECTORY[platform];
    const profileId = String(req.body?.profileId || "").trim() || null;
    const isShopDomain = descriptor.keyPlacement.type === "shop_domain";
    const apiKey = String(req.body?.apiKey || "").trim();
    let shopDomain: string | null = null;
    if (isShopDomain) {
      shopDomain = normalizeShopifyShopDomain(String(req.body?.shopDomain || req.body?.apiKey || ""));
      if (!shopDomain) {
        return res.status(400).json({
          error: "Enter a valid Shopify shop domain (e.g. mystore.myshopify.com).",
          hint: descriptor.keyHint,
        });
      }
    } else if (!apiKey && !descriptor.keyOptional) {
      return res.status(400).json({ error: `API key is required (${descriptor.keyHint}).` });
    }

    const credential = shopDomain ?? apiKey;

    // Validate before storing: the credential must at least survive the MCP
    // initialize handshake.
    const conn = await connectKeyedMcp(platform, credential);
    if (conn.ok === false) {
      return res.status(conn.status === 401 || conn.status === 403 ? 401 : 502).json({
        error: `Could not connect to ${descriptor.label}: ${conn.message}`,
        hint: descriptor.keyHint,
      });
    }

    const username = isShopDomain
      ? shopDomain!
      : conn.handle.serverName || descriptor.label;
    const externalIdentity = isShopDomain ? shopifyStorefrontMcpUrl(shopDomain!) : descriptor.mcpUrl;
    const accountId = profileScopedAccountId(platform, externalIdentity, profileId);
    await tokenStore.set(accountId, {
      platform,
      ownerUserId: userId,
      profileId,
      username,
      displayName: descriptor.label,
      profileUrl: descriptor.profileUrl,
      accessToken: null,
      mcpApiKey: isShopDomain ? null : apiKey || null,
      mcpShopDomain: shopDomain,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform,
      keepAccountId: accountId,
      matchers: [{ key: "displayName", value: descriptor.label }],
      sameProfileId: profileId,
    });

    return res.json({
      ok: true,
      account_id: accountId,
      platform,
      username,
      ...(profileId ? { profile_id: profileId } : {}),
    });
  });

  // --- Tools --------------------------------------------------------------

  app.get("/api/mcp/:accountId/tools", async (req, res) => {
    const stored = await requireMcpAccount(req, res);
    if (!stored) return;
    const platform = String(stored.platform || "");

    try {
      if (isKeyedMcpPlatform(platform)) {
        const credential = keyedMcpCredentialFromStored(stored);
        const result = await listKeyedMcpTools(platform, credential);
        if (result.ok === false) return res.status(502).json({ error: result.message });
        return res.json({ platform, tools: result.tools });
      }
      const token = await freshOauthAccessToken(stored);
      if (token.ok === false) return res.status(token.status).json({ error: token.message });
      const result = await listOauthMcpTools(platform as OauthMcpPlatform, token.accessToken);
      if (result.ok === false) return res.status(502).json({ error: result.message });
      return res.json({ platform, tools: result.tools });
    } catch (err) {
      console.error(`[mcp] tools list failed (${platform}):`, err);
      return res.status(500).json({ error: "MCP tools listing failed." });
    }
  });

  app.post("/api/mcp/:accountId/call", async (req, res) => {
    const stored = await requireMcpAccount(req, res);
    if (!stored) return;
    const platform = String(stored.platform || "");
    const name = String(req.body?.name || "").trim();
    const args =
      req.body?.arguments && typeof req.body.arguments === "object"
        ? (req.body.arguments as Record<string, unknown>)
        : {};
    if (!name) {
      return res.status(400).json({ error: "Tool name is required." });
    }

    try {
      let result: Awaited<ReturnType<typeof callKeyedMcpTool>>;
      if (isKeyedMcpPlatform(platform)) {
        result = await callKeyedMcpTool(platform, keyedMcpCredentialFromStored(stored), name, args);
      } else {
        const token = await freshOauthAccessToken(stored);
        if (token.ok === false) {
          return res.status(token.status).json({ error: token.message });
        }
        result = await callOauthMcpTool(platform as OauthMcpPlatform, token.accessToken, name, args);
      }

      if (result.ok === false) {
        const status = result.status === 401 ? 401 : 502;
        return res.status(status).json({ error: result.message });
      }
      return res.json({
        platform,
        tool: name,
        isError: result.isError,
        text: result.text.slice(0, MAX_TOOL_OUTPUT_CHARS),
        truncated: result.text.length > MAX_TOOL_OUTPUT_CHARS,
      });
    } catch (err) {
      console.error(`[mcp] tool call failed (${platform}/${name}):`, err);
      return res.status(500).json({ error: "MCP tool call failed." });
    }
  });
}
