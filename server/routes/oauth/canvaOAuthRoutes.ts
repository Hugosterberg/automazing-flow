/**
 * Canva Connect OAuth routes.
 * Registered via registerOAuthRoutes → registerCanvaOAuthRoutes.
 */

import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { exchangeCanvaOAuthCode, fetchCanvaUserIdentity } from "../../providers/canva.ts";
import { CANVA_AUTH, CANVA_SCOPES } from "./constants.ts";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  normalizeRequestedProfileId,
} from "./helpers.ts";
import type { OAuthRoutesDeps } from "./types.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";

export type CanvaOAuthRouteCtx = MailOAuthRouteCtx & {
  getExceptionMessage: (error: unknown) => string | undefined;
};

function getCanvaClientId() {
  return String(process.env.CANVA_CLIENT_ID || "").trim();
}

function getCanvaClientSecret() {
  return String(process.env.CANVA_CLIENT_SECRET || "").trim();
}

function canvaScope() {
  return String(process.env.CANVA_SCOPES || CANVA_SCOPES).trim();
}

export function registerCanvaOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: CanvaOAuthRouteCtx
): void {
  const { BASE_URL, generateState, oauthPendingStore, tokenStore, getSessionUserId } = deps;
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

  function getCanvaRedirectUri(req?: unknown) {
    return oauthCallbackUrl(req, "/api/auth/canva/callback");
  }

  // --- Canva Connect OAuth ---
  app.get("/api/auth/canva", async (req, res) => {
    const appBaseUrl = requestedAppBaseUrl(req);
    const returnPage = parseOauthReturnPage(req) || "content";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;

    const clientId = getCanvaClientId();
    const clientSecret = getCanvaClientSecret();
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPageUrlWithBase(
          appBaseUrl || BASE_URL,
          returnPage,
          buildOauthErrorParams("canva_not_configured", {
            status: 500,
            exception: "CANVA_CLIENT_ID or CANVA_CLIENT_SECRET is missing.",
          })
        )
      );
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const redirectUri = getCanvaRedirectUri(req);
    await oauthPendingStore.set(state, {
      platform: "canva",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      redirectUri,
      codeVerifier,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });

    const url = new URL(CANVA_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", canvaScope());
    url.searchParams.set("code_challenge", generateCodeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/canva/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    const fallbackPage = postOauthPage(pending, "canva");
    if (error) {
      return res.redirect(
        buildPageUrlWithBase(
          postOauthBaseUrl(pending),
          fallbackPage,
          buildOauthErrorParams(String(error))
        )
      );
    }
    if (!pending || pending.platform !== "canva") {
      return res.redirect(
        buildPageUrlWithBase(
          BASE_URL,
          oauthPageForPlatform("canva"),
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state was missing or expired.",
          })
        )
      );
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        buildPageUrlWithBase(
          postOauthBaseUrl(pending),
          fallbackPage,
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          })
        )
      );
    }
    await oauthPendingStore.delete(state);
    if (!code) {
      return res.redirect(
        buildPageUrlWithBase(
          postOauthBaseUrl(pending),
          fallbackPage,
          buildOauthErrorParams("missing_code")
        )
      );
    }

    const clientId = getCanvaClientId();
    const clientSecret = getCanvaClientSecret();
    if (!clientId || !clientSecret || !pending.codeVerifier) {
      return res.redirect(
        buildPageUrlWithBase(
          postOauthBaseUrl(pending),
          fallbackPage,
          buildOauthErrorParams("canva_not_configured", {
            status: 500,
            exception: "CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, or PKCE verifier is missing.",
          })
        )
      );
    }

    try {
      const tokenResult = await exchangeCanvaOAuthCode({
        clientId,
        clientSecret,
        code: String(code),
        codeVerifier: String(pending.codeVerifier),
        redirectUri:
          typeof pending.redirectUri === "string" ? pending.redirectUri : getCanvaRedirectUri(req),
      });
      if (tokenResult.ok === false) {
        return res.redirect(
          buildPageUrlWithBase(
            postOauthBaseUrl(pending),
            fallbackPage,
            buildOauthErrorParams("token_exchange_failed", {
              status: tokenResult.status,
              exception: tokenResult.message,
            })
          )
        );
      }

      const identity = await fetchCanvaUserIdentity(tokenResult.accessToken).catch(() => ({
        id: null,
        username: "Canva",
      }));
      const externalIdentity = String(identity.id || identity.username || "canva").toLowerCase();
      const accountId = profileScopedAccountId("canva", externalIdentity, pending.profileId);
      const expiresAt = tokenResult.expiresIn
        ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
        : undefined;

      await tokenStore.set(accountId, {
        platform: "canva",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: identity.username,
        displayName: identity.username,
        profileUrl: "https://www.canva.com",
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt,
        scope: tokenResult.scope || canvaScope(),
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "canva",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: identity.username }],
        sameProfileId: pending.profileId || null,
      });

      const postPage = postOauthPage(pending, "canva");
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), postPage, {
          oauth_success: 1,
          platform: "canva",
          account_id: accountId,
          username: identity.username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error("Canva OAuth error:", err);
      res.redirect(
        buildPageUrlWithBase(
          postOauthBaseUrl(pending),
          fallbackPage,
          buildOauthErrorParams("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          })
        )
      );
    }
  });
}
