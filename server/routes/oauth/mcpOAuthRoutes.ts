/**
 * OAuth-secured remote MCP servers (Day.ai, Windsor.ai, …).
 * Registered via registerOAuthRoutes → registerMcpOAuthRoutes.
 */

import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import {
  OAUTH_MCP_DIRECTORY,
  isOauthMcpPlatform,
  registerMcpOauthClient,
  exchangeMcpOauthCode,
  connectOauthMcp,
} from "../../providers/mcpOauth.ts";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  normalizeRequestedProfileId,
} from "./helpers.ts";
import type { OAuthPendingRecord, OAuthRoutesDeps } from "./types.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";

export type McpOAuthRouteCtx = MailOAuthRouteCtx & {
  getExceptionMessage: (error: unknown) => string | undefined;
};

export function registerMcpOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: McpOAuthRouteCtx
): void {
  const {
    BASE_URL,
    generateState,
    oauthPendingStore,
    tokenStore,
    getSessionUserId,
  } = deps;
  const {
    buildPageUrlWithBase,
    buildOauthErrorParams,
    oauthCallbackUrl,
    requestedAppBaseUrl,
    requireSessionOrRedirect,
    oauthPageForPlatform,
    parseOauthReturnPage,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    getExceptionMessage,
  } = ctx;

// --- OAuth-secured remote MCP servers (Day.ai, Windsor.ai, …) ---
//
// One generic init/callback pair driven by OAUTH_MCP_DIRECTORY. These
// providers implement MCP-spec authorization: authorization_code + PKCE
// with dynamic client registration, so no pre-provisioned client id is
// needed — we self-register per redirect URI and persist the credentials
// in the token store under a reserved platform key.

function mcpOauthClientRecordId(platform: string): string {
  return `mcp_oauth_client:${platform}`;
}

function getMcpOauthEnvClient(envPrefix: string): { clientId: string; clientSecret: string } | null {
  const clientId = String(process.env[`${envPrefix}_CLIENT_ID`] || "").trim();
  const clientSecret = String(process.env[`${envPrefix}_CLIENT_SECRET`] || "").trim();
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

/**
 * Resolve OAuth client credentials for an MCP provider: env override →
 * previously registered client (same redirect URI) → dynamic registration.
 */
async function getMcpOauthClient(
  platform: string,
  redirectUri: string
): Promise<{ clientId: string; clientSecret: string } | { error: string; status: number }> {
  if (!isOauthMcpPlatform(platform)) {
    return { error: "unknown_platform", status: 400 };
  }
  const descriptor = OAUTH_MCP_DIRECTORY[platform];

  const fromEnv = getMcpOauthEnvClient(descriptor.envPrefix);
  if (fromEnv) return fromEnv;

  const recordId = mcpOauthClientRecordId(platform);
  const stored = await tokenStore.get(recordId);
  if (
    stored &&
    String(stored.clientId || "").trim() &&
    String(stored.redirectUri || "") === redirectUri
  ) {
    return {
      clientId: String(stored.clientId),
      clientSecret: String(stored.clientSecret || ""),
    };
  }

  const registered = await registerMcpOauthClient(descriptor, { redirectUri });
  if (registered.ok === false) {
    return { error: registered.message, status: registered.status };
  }
  await tokenStore.set(recordId, {
    platform: "mcp_oauth_client",
    mcpPlatform: platform,
    clientId: registered.clientId,
    clientSecret: registered.clientSecret,
    redirectUri,
    registeredAt: new Date().toISOString(),
  });
  return { clientId: registered.clientId, clientSecret: registered.clientSecret };
}

app.get("/api/auth/mcp/:platform", async (req, res) => {
  const platform = String(req.params.platform || "").toLowerCase();
  const appBaseUrl = requestedAppBaseUrl(req);
  if (!isOauthMcpPlatform(platform)) {
    return res.redirect(
      buildPageUrlWithBase(appBaseUrl || BASE_URL, "connections", buildOauthErrorParams("unknown_platform", {
        status: 400,
        exception: `No OAuth MCP provider named "${platform}".`,
      }))
    );
  }
  const descriptor = OAUTH_MCP_DIRECTORY[platform];
  const returnPage = parseOauthReturnPage(req) || oauthPageForPlatform(platform);
  const userId = requireSessionOrRedirect(req, res, returnPage);
  if (!userId) return;

  const redirectUri = oauthCallbackUrl(req, `/api/auth/mcp/${platform}/callback`);
  const client = await getMcpOauthClient(platform, redirectUri);
  if ("error" in client) {
    return res.redirect(
      buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, buildOauthErrorParams("client_registration_failed", {
        status: client.status,
        exception: client.error,
      }))
    );
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  await oauthPendingStore.set(state, {
    platform,
    userId,
    profileId: normalizeRequestedProfileId(req.query.profile_id),
    appBaseUrl,
    redirectUri,
    codeVerifier,
    createdAt: Date.now(),
    oauthReturnPage: parseOauthReturnPage(req) || undefined,
  });

  const url = new URL(descriptor.authUrl);
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  if (descriptor.scopes) url.searchParams.set("scope", descriptor.scopes);
  url.searchParams.set("code_challenge", generateCodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/api/auth/mcp/:platform/callback", async (req, res) => {
  const platform = String(req.params.platform || "").toLowerCase();
  const { code, state, error } = req.query;
  const pending = await oauthPendingStore.get(state);
  const fallbackPage = postOauthPage(pending, platform);
  if (!isOauthMcpPlatform(platform)) {
    return res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), "connections", buildOauthErrorParams("unknown_platform", { status: 400 }))
    );
  }
  const descriptor = OAUTH_MCP_DIRECTORY[platform];
  if (error) {
    return res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams(String(error)))
    );
  }
  if (!pending || pending.platform !== platform) {
    return res.redirect(
      buildPageUrlWithBase(BASE_URL, oauthPageForPlatform(platform), buildOauthErrorParams("invalid_state", {
        status: 400,
        exception: "OAuth state was missing or expired.",
      }))
    );
  }
  const callbackUserId = getSessionUserId(req);
  if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
    await oauthPendingStore.delete(state);
    return res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("invalid_state", {
        status: 400,
        exception: "OAuth state did not match the active session.",
      }))
    );
  }
  await oauthPendingStore.delete(state);
  if (!code) {
    return res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("missing_code"))
    );
  }

  const redirectUri =
    typeof pending.redirectUri === "string"
      ? pending.redirectUri
      : oauthCallbackUrl(req, `/api/auth/mcp/${platform}/callback`);
  const client = await getMcpOauthClient(platform, redirectUri);
  if ("error" in client || !pending.codeVerifier) {
    return res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("client_registration_failed", {
        status: "error" in client ? client.status : 500,
        exception: "error" in client ? client.error : "PKCE verifier is missing.",
      }))
    );
  }

  try {
    const tokenResult = await exchangeMcpOauthCode(descriptor, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      code: String(code),
      codeVerifier: String(pending.codeVerifier),
      redirectUri,
    });
    if (tokenResult.ok === false) {
      return res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("token_exchange_failed", {
          status: tokenResult.status,
          exception: tokenResult.message,
        }))
      );
    }

    // Validate the token with an MCP initialize; the server name doubles
    // as the connected account's display identity.
    const conn = await connectOauthMcp(platform, tokenResult.accessToken).catch(() => null);
    const username = (conn && conn.ok && conn.handle.serverName) || descriptor.label;

    const accountId = profileScopedAccountId(platform, descriptor.mcpUrl, pending.profileId);
    const expiresAt = tokenResult.expiresIn
      ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
      : undefined;

    await tokenStore.set(accountId, {
      platform,
      ownerUserId: callbackUserId || pending.userId,
      profileId: pending.profileId || null,
      username,
      displayName: descriptor.label,
      profileUrl: descriptor.profileUrl,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt,
      scope: tokenResult.scope || descriptor.scopes || undefined,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform,
      keepAccountId: accountId,
      matchers: [{ key: "displayName", value: descriptor.label }],
      sameProfileId: pending.profileId || null,
    });

    const postPage = postOauthPage(pending, platform);
    res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), postPage, {
        oauth_success: 1,
        platform,
        account_id: accountId,
        username,
        profile_id: pending.profileId || undefined,
      })
    );
  } catch (err) {
    console.error(`${descriptor.label} OAuth error:`, err);
    res.redirect(
      buildPageUrlWithBase(postOauthBaseUrl(pending), fallbackPage, buildOauthErrorParams("token_exchange_failed", {
        status: 500,
        exception: getExceptionMessage(err),
      }))
    );
  }
});
}
