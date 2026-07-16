/**
 * YouTube (Google) OAuth routes.
 * Registered via registerOAuthRoutes → registerYouTubeOAuthRoutes.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { GOOGLE_AUTH, GOOGLE_TOKEN, YOUTUBE_SCOPES } from "./constants.ts";
import {
  normalizeRequestedProfileId,
  profileParam,
} from "./helpers.ts";
import type { CommerceOAuthRouteCtx } from "./shopifyOAuthRoutes.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export type YouTubeOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
};

export function registerYouTubeOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: YouTubeOAuthRouteCtx
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

  // --- YouTube (Google) OAuth ---
  app.get("/api/auth/youtube", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=youtube_not_configured", returnPage));
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "youtube",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/youtube/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", YOUTUBE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/youtube/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "youtube",
          buildOAuthCallbackErrorQuery(error, errorDescription, "youtube"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "youtube","oauth_error=youtube_not_configured", pending.oauthReturnPage));
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/youtube/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "youtube",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      // Hämta kanalinfo för username + stabil kanal-id
      let username = "YouTube-konto";
      const meRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.items?.[0]?.snippet?.title) {
        username = meData.items[0].snippet.title;
      }
      const channelId = meData.items?.[0]?.id ? String(meData.items[0].id) : "";
      // Stable id per YouTube channel: reconnecting overwrites instead of duplicating.
      const accountId = channelId ? profileScopedAccountId("yt", channelId, pending.profileId) : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "youtube",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        channelId: channelId || undefined,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "youtube",
        keepAccountId: accountId,
        matchers: [
          { key: "channelId", value: channelId },
          { key: "username", value: username !== "YouTube-konto" ? username : null },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "youtube");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=youtube&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("YouTube OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "youtube","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
