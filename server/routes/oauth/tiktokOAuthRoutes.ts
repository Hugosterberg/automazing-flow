/**
 * TikTok OAuth routes (Zernio auto + official fallback).
 * Registered via registerOAuthRoutes → registerTikTokOAuthRoutes.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { TIKTOK_AUTH, TIKTOK_TOKEN } from "./constants.ts";
import {
  getZernioConnectUrl,
  normalizeRequestedProfileId,
  profileParam,
  requestBusinessProfileId,
  zernioOauthErrorQuery,
} from "./helpers.ts";
import type { CommerceOAuthRouteCtx } from "./shopifyOAuthRoutes.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export type TikTokOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
};

export function registerTikTokOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: TikTokOAuthRouteCtx
): void {
  const {
    BASE_URL,
    ZERNIO_API_BASE,
    getZernioApiKey,
    getOrCreateZernioProfileId,
    generateState,
    oauthPendingStore,
    tokenStore,
    getSessionUserId,
  } = deps;
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

  // --- TikTok OAuth ---
  app.get("/api/auth/tiktok", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;

    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "auto").toLowerCase();
    const tryZernio = provider !== "official";
    const zernioKey = getZernioApiKey();
    let zernioAutoFailure: unknown = null;
    if (tryZernio && zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
        if (zernioProfileId) {
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "tiktok",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            appBaseUrl: requestedAppBaseUrl(req),
            createdAt: Date.now(),
            oauthReturnPage: parseOauthReturnPage(req) || undefined,
          });
          const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["tiktok"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        }
      } catch (e) {
        if (provider === "zernio") {
          return res.redirect(oauthRedirectTo(base, "tiktok",zernioOauthErrorQuery(e), returnPage));
        }
        // Fallback to official TikTok OAuth if Zernio connect is unavailable,
        // but keep the Zernio reason in case official isn't configured either.
        console.warn("[TikTok] Zernio connect unavailable, using official OAuth:", String(e?.message || e));
        zernioAutoFailure = e;
      }
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "tiktok",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=tiktok_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "tiktok",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/tiktok/callback");
    const url = new URL(TIKTOK_AUTH);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.list");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/tiktok/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "tiktok",
          buildOAuthCallbackErrorQuery(error, errorDescription, "tiktok"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=tiktok_not_configured", pending.oauthReturnPage));
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/tiktok/callback");
      const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(TIKTOK_TOKEN, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "tiktok",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      let username = data.open_id;
      try {
        const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=username,display_name", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15_000),
        });
        const userData = await userRes.json().catch(() => ({}));
        if (!userRes.ok) {
          console.warn("[TikTok] user info failed:", userRes.status, userData?.error || userData?.message || "");
        }
        if (userData.data?.user?.username) username = userData.data.user.username;
        else if (userData.data?.user?.display_name) username = userData.data.user.display_name;
      } catch (err) {
        console.warn("[TikTok] user info request failed:", err);
      }
      // Stable id per TikTok open_id: reconnecting overwrites instead of duplicating.
      const accountId = data.open_id
        ? profileScopedAccountId("tiktok", String(data.open_id), pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "tiktok",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        openId: data.open_id,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "tiktok",
        keepAccountId: accountId,
        matchers: [
          { key: "openId", value: data.open_id ? String(data.open_id) : null },
          { key: "username", value: username },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "tiktok");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=tiktok&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("TikTok OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "tiktok","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
