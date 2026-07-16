/**
 * X (Twitter) OAuth 2.0 with PKCE.
 * Registered via registerOAuthRoutes → registerXOAuthRoutes.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { X_AUTH, X_SCOPES } from "./constants.ts";
import {
  fetchXToken,
  generateCodeChallenge,
  generateCodeVerifier,
  normalizeRequestedProfileId,
  profileParam,
} from "./helpers.ts";
import type { CommerceOAuthRouteCtx } from "./shopifyOAuthRoutes.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export type XOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
};

export function registerXOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: XOAuthRouteCtx
): void {
  const { BASE_URL, generateState, oauthPendingStore, tokenStore, getSessionUserId } = deps;
  const {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
    oauthCallbackUrl,
  } = ctx;

  // --- X (Twitter) OAuth 2.0 with PKCE ---
  app.get("/api/auth/x", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = process.env.X_CLIENT_ID;
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "x","oauth_error=x_not_configured", returnPage));
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    await oauthPendingStore.set(state, {
      platform: "x",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      codeVerifier,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/x/callback");
    const url = new URL(X_AUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", X_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    res.redirect(url.toString());
  });

  app.get("/api/auth/x/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "x",
          buildOAuthCallbackErrorQuery(error, errorDescription, "x"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) return res.redirect(oauthRedirectTo(base, "x","oauth_error=invalid_state"));
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "x","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId) return res.redirect(oauthRedirectTo(base, "x","oauth_error=x_not_configured", pending.oauthReturnPage));
    if (!pending.codeVerifier) {
      return res.redirect(oauthRedirectTo(base, "x","oauth_error=invalid_pkce_state", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/x/callback");
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code || ""),
        redirect_uri: redirectUri,
        code_verifier: pending.codeVerifier,
      });
      const headers = { "Content-Type": "application/x-www-form-urlencoded" };
      if (clientSecret) {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      } else {
        body.set("client_id", clientId);
      }
      const tokenRes = await fetchXToken(body, headers);
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        console.error("[X] token error:", tokenData.error, tokenData.error_description);
        return res.redirect(
          oauthRedirectTo(base, "x",`oauth_error=${encodeURIComponent(String(tokenData.error || "token_exchange_failed"))}`, pending.oauthReturnPage)
        );
      }
      const userRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(15_000) }
      );
      const userData = await userRes.json().catch(() => ({}));
      const user = userData.data || {};
      // Stable id per X user: reconnecting overwrites instead of duplicating.
      const accountId = user.id ? profileScopedAccountId("x", String(user.id), pending.profileId) : crypto.randomUUID();
      const username = user.username || user.name || accountId.slice(0, 8);
      await tokenStore.set(accountId, {
        platform: "x",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        xUserId: user.id,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "x",
        keepAccountId: accountId,
        matchers: [
          { key: "xUserId", value: user.id ? String(user.id) : null },
          { key: "username", value: user.username ? String(user.username) : null },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "x");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=x&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("[X] OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "x","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
