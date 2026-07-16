/**
 * Instagram OAuth routes (Zernio + direct Meta), including late/instagram callback aliases.
 * Registered via registerMetaSocialOAuthRoutes → registerInstagramOAuthRoutes.
 */

import crypto from "crypto";
import {
  deterministicAccountId,
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { fetchZernio } from "../../lib/zernioFetch.ts";
import { exchangeForLongLivedInstagramToken } from "../../providers/instagram.ts";
import { IG_AUTH, IG_TOKEN } from "./constants.ts";
import {
  normalizeRequestedProfileId,
  profileParam,
  zernioConnectFailureHint,
  zernioOauthErrorQuery,
  requestBusinessProfileId,
} from "./helpers.ts";
import type { MetaSocialOAuthRouteCtx } from "./metaPlatformOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export function registerInstagramOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: MetaSocialOAuthRouteCtx
): void {
  const {
    BASE_URL,
    ZERNIO_API_BASE,
    zernio,
    getZernioApiKey,
    getOrCreateZernioProfileId,
    mapZernioPlatform,
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
    oauthCallbackUrl,
  } = ctx;

  // Instagram: via Zernio (recommended) eller direkt Meta OAuth
  app.get("/api/auth/instagram", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    res.set("Cache-Control", "no-store, no-cache");
    const zernioKey = getZernioApiKey();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    // Send the user back to the origin they came from, not a hardcoded
    // BASE_URL — a mismatch logs them out (session lives per-origin).
    const appBaseUrl = requestedAppBaseUrl(req);
    const base = appBaseUrl || BASE_URL;
    console.log(
      "[Instagram] ZERNIO_API_KEY:",
      zernioKey ? "set" : "not set — add ZERNIO_API_KEY to .env.local"
    );

    if (zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
        if (!zernioProfileId) {
          return res.redirect(`${base}/${returnPage}?oauth_error=zernio_profile_failed`);
        }
        const state = generateState();
        await oauthPendingStore.set(state, {
          platform: "instagram",
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          appBaseUrl,
          createdAt: Date.now(),
          oauthReturnPage: parseOauthReturnPage(req) || undefined,
        });
        const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/instagram/callback?state=${state}`);
        const connectUrl = new URL(`${ZERNIO_API_BASE}/connect/instagram`);
        connectUrl.searchParams.set("profileId", zernioProfileId);
        connectUrl.searchParams.set("redirect_url", redirectUrl);

        const connectRes = await fetchZernio(connectUrl.toString(), {
          headers: { Authorization: `Bearer ${zernioKey}` },
        });
        if (!connectRes.ok) {
          const err = await connectRes.text().catch(() => "");
          console.error("[Zernio] Instagram connect URL error:", connectRes.status, err.slice(0, 200));
          const hint = zernioConnectFailureHint(connectRes.status, err, "instagram");
          return res.redirect(
            `${base}/${returnPage}?oauth_error=zernio_connect_failed&oauth_hint=${encodeURIComponent(hint.slice(0, 240))}`
          );
        }
        const { authUrl } = await connectRes.json();
        if (!authUrl) {
          return res.redirect(`${base}/${returnPage}?oauth_error=zernio_no_auth_url`);
        }
        return res.redirect(authUrl);
      } catch (err) {
        console.error("[Zernio] Instagram init error:", err);
        return res.redirect(`${base}/${returnPage}?${zernioOauthErrorQuery(err)}`);
      }
    }

    const clientId = (process.env.INSTAGRAM_CLIENT_ID || "").trim();
    if (!clientId) {
      console.warn(
        "Instagram: ZERNIO_API_KEY is missing (length: %s). Add ZERNIO_API_KEY from zernio.com, or set INSTAGRAM_* for direct Meta OAuth.",
        (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").length
      );
      return res.redirect(`${base}/${returnPage}?oauth_error=instagram_not_configured`);
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "instagram",
      userId,
      profileId: ourProfileId,
      appBaseUrl,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/instagram/callback");
    const url = new URL(IG_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user_profile,user_media");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  async function handleZernioInstagramCallback(req, res) {
    const { state, error, accountId: queryAccountId, username } = req.query;
    const pendingEarly = state ? await oauthPendingStore.get(state) : null;
    const pageEarly = postOauthPage(pendingEarly, "instagram");
    const earlyBase = postOauthBaseUrl(pendingEarly);
    if (error) {
      return res.redirect(`${earlyBase}/${pageEarly}?oauth_error=${encodeURIComponent(error)}`);
    }
    const pending = await oauthPendingStore.get(state);
    if (!pending || pending.platform !== "instagram") {
      return res.redirect(`${earlyBase}/${pageEarly}?oauth_error=invalid_state`);
    }
    const base = postOauthBaseUrl(pending);
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalPairMismatch =
      pendingUserId.startsWith("local_") &&
      callbackUserIdStr.startsWith("local_") &&
      pendingUserId !== callbackUserIdStr;

    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition && !isLocalPairMismatch) {
      await oauthPendingStore.delete(state);
      return res.redirect(`${base}/${postOauthPage(pending, "instagram")}?oauth_error=invalid_state`);
    }
    const successPage = postOauthPage(pending, "instagram");
    await oauthPendingStore.delete(state);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(`${base}/${successPage}?oauth_error=zernio_not_configured`);
    }

    try {
      let accountId = queryAccountId;
      let displayUsername = username;
      if (!accountId || !displayUsername) {
        const result = await zernio.listAccounts();
        if (!result.ok) {
          return res.redirect(`${base}/${successPage}?oauth_error=zernio_fetch_accounts_failed`);
        }
        const list = result.accounts;
        const ig = list.find(
          (a) => mapZernioPlatform(a.platform || a.type || a.provider || a.channel) === "instagram"
        );
        const acc = ig || (list.length ? list[list.length - 1] : null);
        if (acc) {
          accountId = accountId || acc._id || acc.id || acc.accountId;
          displayUsername = displayUsername || acc.username || acc.name || acc.displayName || "Instagram";
        }
      }
      if (!accountId) {
        return res.redirect(`${base}/${successPage}?oauth_error=zernio_no_account`);
      }
      const zernioId = String(accountId);
      // Stable per (Zernio channel, business profile): reconnecting the same
      // channel into the same profile overwrites, while the same channel can
      // still be linked to other profiles as separate entries.
      const storeId = deterministicAccountId("zernio", `${zernioId}:${pending.profileId || ""}`);
      await tokenStore.set(storeId, {
        platform: "instagram",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        zernioAccountId: zernioId,
        username: displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram",
        instagramViaZernio: true,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "instagram",
        keepAccountId: storeId,
        matchers: [{ key: "zernioAccountId", value: zernioId }],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const usernameParam = encodeURIComponent(
        displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram"
      );
      res.redirect(
        `${base}/${successPage}?oauth_success=1&platform=instagram&account_id=${storeId}&username=${usernameParam}&zernio_account_id=${encodeURIComponent(
          zernioId
        )}${profileQuery}`
      );
    } catch (err) {
      console.error("[Zernio] Instagram callback error:", err);
      res.redirect(`${base}/${successPage}?oauth_error=token_exchange_failed`);
    }
  }

  app.get("/api/auth/zernio/instagram/callback", handleZernioInstagramCallback);
  app.get("/api/auth/late/instagram/callback", handleZernioInstagramCallback);

  app.get("/api/auth/instagram/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pendingMeta = state ? await oauthPendingStore.get(state) : null;
    const igPage = postOauthPage(pendingMeta, "instagram");
    const base = postOauthBaseUrl(pendingMeta);
    if (error) {
      return res.redirect(`${base}/${igPage}?oauth_error=${error}`);
    }
    const pending = pendingMeta;
    if (!pending) {
      return res.redirect(`${base}/${igPage}?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(`${base}/${postOauthPage(pending, "instagram")}?oauth_error=invalid_state`);
    }
    const igSuccessPage = postOauthPage(pending, "instagram");
    await oauthPendingStore.delete(state);

    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${base}/${igSuccessPage}?oauth_error=instagram_not_configured`);
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/instagram/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: String(code || ""),
      });
      const tokenRes = await fetch(IG_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_message || data.error_description || data.error || "token_exchange_failed";
        return res.redirect(`${base}/${igSuccessPage}?oauth_error=${encodeURIComponent(String(rawErr))}`);
      }
      const username = data.user?.username || `user_${data.user_id}`;
      // Instagram returns a short-lived (~1h) token. Exchange it for a
      // long-lived (~60 day) token up front and store its expiry so the
      // account-data handler can refresh it before it dies. Fall back to the
      // short-lived token if the exchange fails (the handler still surfaces a
      // clean reconnect prompt in that case).
      const longLived = await exchangeForLongLivedInstagramToken(data.access_token, clientSecret);
      const igAccessToken = longLived?.accessToken || data.access_token;
      const igExpiresAt = longLived?.expiresAt || null;
      // Stable id per Instagram user: reconnecting overwrites instead of duplicating.
      const accountId = data.user_id
        ? profileScopedAccountId("ig", String(data.user_id), pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "instagram",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: igAccessToken,
        expiresAt: igExpiresAt,
        userId: data.user_id,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "instagram",
        keepAccountId: accountId,
        matchers: [
          { key: "userId", value: data.user_id ? String(data.user_id) : null },
          { key: "username", value: username },
        ],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${base}/${igSuccessPage}?oauth_success=1&platform=instagram&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Instagram OAuth error:", err);
      res.redirect(`${base}/${igSuccessPage}?oauth_error=token_exchange_failed`);
    }
  });
}
