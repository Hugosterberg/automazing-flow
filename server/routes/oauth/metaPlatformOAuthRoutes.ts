/**
 * Facebook, WhatsApp, Meta Business, Google Ads OAuth routes,
 * and shared Zernio platform callback.
 * Registered via registerMetaSocialOAuthRoutes → registerMetaPlatformOAuthRoutes.
 */

import {
  deterministicAccountId,
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import {
  GOOGLE_ADS_SCOPES,
  GOOGLE_AUTH,
  GOOGLE_TOKEN,
  META_BUSINESS_DEFAULT_SCOPES,
} from "./constants.ts";
import {
  getZernioConnectUrl,
  normalizeRequestedProfileId,
  profileParam,
  resolveAndSelectGoogleBusinessLocation,
  resolveZernioAccountAfterCallback,
  zernioOauthErrorQuery,
  requestBusinessProfileId,
} from "./helpers.ts";
import type { CommerceOAuthRouteCtx } from "./shopifyOAuthRoutes.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

/** Shared ctx for Instagram + Meta platform OAuth route modules. */
export type MetaSocialOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
  oauthPageForPlatform: MailOAuthRouteCtx["oauthPageForPlatform"];
  getOptionalZernioProfileId: (
    label: string,
    businessProfileId?: string | null
  ) => Promise<string | null>;
};

export function registerMetaPlatformOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: MetaSocialOAuthRouteCtx
): void {
  const {
    BASE_URL,
    ZERNIO_API_BASE,
    zernio,
    getZernioApiKey,
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
    oauthRedirectTo,
    oauthCallbackUrl,
    oauthPageForPlatform,
    getOptionalZernioProfileId,
  } = ctx;

  function oauthRedirect(platform: string, query: string, oauthReturnPage?: string | null) {
    return oauthRedirectTo(BASE_URL, platform, query, oauthReturnPage);
  }

  function getMetaGraphVersion() {
    // v20.0 sunsets 2026-09-24; v23.0 is guaranteed through mid-2027.
    return String(process.env.META_GRAPH_VERSION || "v23.0").trim().replace(/^\/+|\/+$/g, "");
  }

  function getMetaAppId() {
    return String(
      process.env.META_APP_ID ||
        process.env.FACEBOOK_CLIENT_ID ||
        process.env.FACEBOOK_APP_ID ||
        ""
    ).trim();
  }

  function getMetaAppSecret() {
    return String(
      process.env.META_APP_SECRET ||
        process.env.FACEBOOK_CLIENT_SECRET ||
        process.env.FACEBOOK_APP_SECRET ||
        ""
    ).trim();
  }

  function getMetaBusinessScopes() {
    return String(process.env.META_BUSINESS_SCOPES || META_BUSINESS_DEFAULT_SCOPES).trim();
  }

  async function startOfficialGoogleAdsOAuth(req, res, userId, hubReturn) {
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=google_ads_not_configured", hubReturn || undefined)
      );
    }

    const state = generateState();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    await oauthPendingStore.set(state, {
      platform: "google_ads",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: hubReturn || undefined,
    });

    const redirectUri = oauthCallbackUrl(req, "/api/auth/google_ads/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_ADS_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  }

  async function startOfficialMetaBusinessOAuth(req, res, userId, hubReturn) {
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const appId = getMetaAppId();
    if (!appId) {
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=meta_business_not_configured", hubReturn || undefined)
      );
    }

    const state = generateState();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    await oauthPendingStore.set(state, {
      platform: "meta_business",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: hubReturn || undefined,
    });

    const redirectUri = oauthCallbackUrl(req, "/api/auth/meta_business/callback");
    const url = new URL(`https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", getMetaBusinessScopes());
    url.searchParams.set("state", state);
    const loginConfigId = String(process.env.META_LOGIN_CONFIG_ID || "").trim();
    if (loginConfigId) url.searchParams.set("config_id", loginConfigId);
    return res.redirect(url.toString());
  }

  const zernioConnectPlatformMap = {
    facebook: { slugs: ["facebook"], appPlatform: "facebook" },
    whatsapp: { slugs: ["whatsapp"], appPlatform: "whatsapp" },
    meta_business: {
      slugs: [
        "meta-business",
        "meta_business",
        "meta",
        "meta-ads",
        "facebook-business",
        "facebook-ads",
        "facebook",
      ],
      appPlatform: "meta_business",
    },
  };
  const googleAdsZernioConfig = {
    slugs: ["google-ads", "google_ads", "googleads"],
    appPlatform: "google_ads",
  };

  async function startZernioOAuthPlatform(req, res, routePlatform, config, hubReturn, userId) {
      // Capture the origin the user came from so the callback returns them to
      // it (a hardcoded BASE_URL on a different trusted origin logs them out).
      const appBaseUrl = requestedAppBaseUrl(req);
      const base = appBaseUrl || BASE_URL;
      const zernioKey = getZernioApiKey();
      if (!zernioKey) {
        return res.redirect(
          oauthRedirectTo(base, config.appPlatform, "oauth_error=zernio_not_configured", hubReturn || undefined)
        );
      }
      try {
        const zernioProfileId = await getOptionalZernioProfileId(
          config.appPlatform,
          requestBusinessProfileId(req)
        );
        const state = generateState();
        const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
        await oauthPendingStore.set(state, {
          platform: config.appPlatform,
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          appBaseUrl,
          createdAt: Date.now(),
          oauthReturnPage: hubReturn || undefined,
        });
        const redirectUrl = oauthCallbackUrl(req, `/api/auth/zernio/platform/callback?state=${state}`);
        const authUrl = await getZernioConnectUrl({
          ZERNIO_API_BASE,
          zernioKey,
          platformSlugs: config.slugs,
          profileId: zernioProfileId,
          redirectUrl,
          extraParams: config.extraParams,
        });
        return res.redirect(authUrl);
      } catch (e) {
        const msg = String(e?.message || "");
        const hint = String((e as { hint?: string })?.hint || "");
        console.error(`[Zernio ${routePlatform}] connect init failed:`, msg, hint.slice(0, 120));
        if (`${msg} ${hint}`.includes("Platform not supported")) {
          return res.redirect(
            oauthRedirectTo(
              base,
              config.appPlatform,
              routePlatform === "google_business"
                ? "oauth_error=zernio_gmb_not_supported"
                : "oauth_error=zernio_platform_not_supported",
              hubReturn || undefined
            )
          );
        }
        // ZernioConnectError carries code + the upstream reason — surface both.
        return res.redirect(
          oauthRedirectTo(base, config.appPlatform, zernioOauthErrorQuery(e), hubReturn || undefined)
        );
      }
  }

  function registerZernioOAuthPlatformRoute(routePlatform) {
    const config = zernioConnectPlatformMap[routePlatform];
    if (!config) return;

    app.get(`/api/auth/${routePlatform}`, async (req, res) => {
      const hubReturn = parseOauthReturnPage(req);
      const userId = requireSessionOrRedirect(
        req,
        res,
        hubReturn || oauthPageForPlatform(config.appPlatform)
      );
      if (!userId) return;
      return startZernioOAuthPlatform(req, res, routePlatform, config, hubReturn, userId);
    });
  }

  app.get("/api/auth/google_ads", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    const requestedProvider = String(req.query.provider || "official").trim().toLowerCase();
    if (requestedProvider === "zernio") {
      return startZernioOAuthPlatform(
        req,
        res,
        "google_ads",
        googleAdsZernioConfig,
        hubReturn,
        userId
      );
    }
    return startOfficialGoogleAdsOAuth(req, res, userId, hubReturn);
  });

  app.get("/api/auth/google_ads/official", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    return startOfficialGoogleAdsOAuth(req, res, userId, hubReturn);
  });

  app.get("/api/auth/meta_business", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    const requestedProvider = String(req.query.provider || "official").trim().toLowerCase();
    if (requestedProvider === "zernio") {
      return startZernioOAuthPlatform(
        req,
        res,
        "meta_business",
        zernioConnectPlatformMap.meta_business,
        hubReturn,
        userId
      );
    }
    return startOfficialMetaBusinessOAuth(req, res, userId, hubReturn);
  });

  app.get("/api/auth/meta_business/official", async (req, res) => {
    const hubReturn = parseOauthReturnPage(req);
    const userId = requireSessionOrRedirect(req, res, hubReturn || "marketing");
    if (!userId) return;
    return startOfficialMetaBusinessOAuth(req, res, userId, hubReturn);
  });

  registerZernioOAuthPlatformRoute("facebook");
  registerZernioOAuthPlatformRoute("whatsapp");

  app.get("/api/auth/google_ads/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_ads",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_ads"),
          pending?.oauthReturnPage
        )
      );
    }

    if (!pending || pending.platform !== "google_ads") {
      return res.redirect(oauthRedirectTo(base, "google_ads","oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=invalid_state", pending?.oauthReturnPage)
      );
    }
    await oauthPendingStore.delete(state);

    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=google_ads_not_configured", pending?.oauthReturnPage)
      );
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google_ads/callback");
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
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_ads",
            `oauth_error=${encodeURIComponent(String(rawErr))}`,
            pending?.oauthReturnPage
          )
        );
      }

      let username = "Google Ads";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = String(meData.email);

      const identityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gads", identityRaw, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "google_ads",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        scopes: GOOGLE_ADS_SCOPES,
        isOfficial: true,
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, "google_ads");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${successPath}?oauth_success=1&platform=google_ads&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Ads OAuth error:", err);
      return res.redirect(
        oauthRedirectTo(base, "google_ads","oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });

  app.get("/api/auth/meta_business/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "meta_business",
          buildOAuthCallbackErrorQuery(error, errorDescription, "meta_business"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending || pending.platform !== "meta_business") {
      return res.redirect(oauthRedirectTo(base, "meta_business","oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      await oauthPendingStore.delete(state);
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=invalid_state", pending?.oauthReturnPage)
      );
    }
    await oauthPendingStore.delete(state);

    const appId = getMetaAppId();
    const appSecret = getMetaAppSecret();
    if (!appId || !appSecret) {
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=meta_business_not_configured", pending?.oauthReturnPage)
      );
    }

    try {
      const graphVersion = getMetaGraphVersion();
      const redirectUri = oauthCallbackUrl(req, "/api/auth/meta_business/callback");
      const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("code", String(code || ""));

      const tokenRes = await fetch(tokenUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        const rawErr =
          tokenData?.error?.message ||
          tokenData?.error_description ||
          tokenData?.error ||
          "token_exchange_failed";
        return res.redirect(
          oauthRedirectTo(
            base,
            "meta_business",
            `oauth_error=${encodeURIComponent(String(rawErr))}`,
            pending?.oauthReturnPage
          )
        );
      }

      const accessToken = String(tokenData.access_token);
      const graphBase = `https://graph.facebook.com/${graphVersion}`;
      const meRes = await fetch(
        `${graphBase}/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
      );
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || meData.error) {
        const rawErr = meData?.error?.message || "meta_profile_failed";
        return res.redirect(
          oauthRedirectTo(
            base,
            "meta_business",
            `oauth_error=${encodeURIComponent(String(rawErr))}`,
            pending?.oauthReturnPage
          )
        );
      }

      const [businessesRes, adAccountsRes, pagesRes] = await Promise.allSettled([
        fetch(
          `${graphBase}/me/businesses?fields=id,name,verification_status&limit=25&access_token=${encodeURIComponent(
            accessToken
          )}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
        ),
        fetch(
          `${graphBase}/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name&limit=25&access_token=${encodeURIComponent(
            accessToken
          )}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
        ),
        fetch(
          `${graphBase}/me/accounts?fields=id,name,access_token,tasks&limit=25&access_token=${encodeURIComponent(
            accessToken
          )}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
        ),
      ]);
      const businesses =
        businessesRes.status === "fulfilled"
          ? await businessesRes.value.json().catch(() => ({}))
          : {};
      const adAccounts =
        adAccountsRes.status === "fulfilled"
          ? await adAccountsRes.value.json().catch(() => ({}))
          : {};
      const pagesBody =
        pagesRes.status === "fulfilled"
          ? await pagesRes.value.json().catch(() => ({}))
          : {};
      const metaPages = (Array.isArray(pagesBody?.data) ? pagesBody.data : [])
        .filter((p: { id?: string; access_token?: string }) => p?.id && p?.access_token)
        .map((p: { id: string; name?: string; access_token: string; tasks?: string[] }) => ({
          id: String(p.id),
          name: String(p.name || p.id),
          accessToken: String(p.access_token),
          tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : [],
        }));
      const firstBusiness = Array.isArray(businesses?.data) ? businesses.data[0] : null;
      const firstAdAccount = Array.isArray(adAccounts?.data) ? adAccounts.data[0] : null;
      const displayName = String(
        firstBusiness?.name ||
        firstAdAccount?.name ||
        meData.name ||
        meData.email ||
        "Meta Business"
      );
      const identityRaw = String(meData.id || meData.email || displayName || "").toLowerCase();
      const accountId = profileScopedAccountId("meta", identityRaw, pending.profileId);

      await tokenStore.set(accountId, {
        platform: "meta_business",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: displayName,
        accessToken,
        tokenType: tokenData.token_type || "bearer",
        expiresIn: tokenData.expires_in || null,
        scopes: getMetaBusinessScopes(),
        isOfficial: true,
        metaUserId: meData.id || null,
        metaBusinessId: firstBusiness?.id || null,
        metaAdAccountId: firstAdAccount?.id || null,
        metaBusinesses: Array.isArray(businesses?.data) ? businesses.data : [],
        metaAdAccounts: Array.isArray(adAccounts?.data) ? adAccounts.data : [],
        metaPages,
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, "meta_business");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${successPath}?oauth_success=1&platform=meta_business&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(displayName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Meta Business OAuth error:", err);
      return res.redirect(
        oauthRedirectTo(base, "meta_business","oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });

  app.get("/api/auth/zernio/platform/callback", async (req, res) => {
    const {
      state,
      error,
      accountId: queryAccountId,
      username: queryUsername,
      connect_token: queryConnectToken,
      connectToken: queryConnectTokenCamel,
    } = req.query;
    if (error) {
      const pendingForError = state ? await oauthPendingStore.get(String(state)) : null;
      const platformForError = pendingForError?.platform || "facebook";
      return res.redirect(
        oauthRedirectTo(
          postOauthBaseUrl(pendingForError),
          platformForError,
          `oauth_error=${encodeURIComponent(error)}`,
          pendingForError?.oauthReturnPage
        )
      );
    }
    let resolvedState = state ? String(state) : "";
    let pending = await oauthPendingStore.get(resolvedState);
    const callbackUserId = getSessionUserId(req);
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    // Some Zernio provider flows may drop/replace query params on redirect.
    // Recover by using the most recent pending Zernio state for the same user.
    if (!pending) {
      const candidates = await oauthPendingStore.listZernioRecentForUser(callbackUserIdStr);
      if (candidates.length === 1) {
        [resolvedState, pending] = candidates[0];
      }
    }
    if (!pending) {
      return res.redirect(oauthRedirect("facebook", "oauth_error=invalid_state"));
    }
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      await oauthPendingStore.delete(resolvedState);
      return res.redirect(
        oauthRedirectTo(
          postOauthBaseUrl(pending),
          pending?.platform || "facebook",
          "oauth_error=invalid_state",
          pending?.oauthReturnPage
        )
      );
    }
    await oauthPendingStore.delete(resolvedState);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(
        oauthRedirectTo(
          postOauthBaseUrl(pending),
          pending?.platform || "facebook",
          "oauth_error=zernio_not_configured",
          pending?.oauthReturnPage
        )
      );
    }

    try {
      const connectToken =
        String(queryConnectToken || queryConnectTokenCamel || "").trim() || null;
      if (pending.platform === "google_business" && connectToken) {
        await resolveAndSelectGoogleBusinessLocation({
          ZERNIO_API_BASE,
          apiKey,
          connectToken,
        });
      }

      const { accountId, username, rawPlatform } = await resolveZernioAccountAfterCallback({
        zernio,
        mapZernioPlatform,
        desiredPlatform: pending.platform,
        queryAccountId,
        queryUsername,
      });

      const zernioAccountId = String(accountId);
      // Stable per (Zernio channel, business profile): reconnecting the same
      // channel into the same profile overwrites, while the same channel can
      // still be linked to other profiles as separate entries.
      const appAccountId = deterministicAccountId(
        "zernio",
        `${zernioAccountId}:${pending.profileId || ""}`
      );
      const safeUsername = String(username || pending.platform || "account").replace(/^@/, "");

      await tokenStore.set(appAccountId, {
        platform: pending.platform,
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: null,
        isZernio: true,
        zernioAccountId,
        zernioPlatform: rawPlatform || pending.platform,
        username: safeUsername,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: pending.platform,
        keepAccountId: appAccountId,
        matchers: [{ key: "zernioAccountId", value: zernioAccountId }],
        sameProfileId: pending.profileId || null,
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, pending.platform);
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${successPath}?oauth_success=1&platform=${encodeURIComponent(
          pending.platform
        )}&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(
          safeUsername
        )}&zernio_account_id=${encodeURIComponent(zernioAccountId)}${profileQuery}`
      );
    } catch (e) {
      const base = postOauthBaseUrl(pending);
      const msg = String(e?.message || "");
      if (msg === "zernio_fetch_accounts_failed") {
        return res.redirect(
          oauthRedirectTo(
            base,
            pending?.platform || "facebook",
            "oauth_error=zernio_fetch_accounts_failed",
            pending?.oauthReturnPage
          )
        );
      }
      if (msg === "zernio_no_account") {
        return res.redirect(
          oauthRedirectTo(base, pending?.platform || "facebook", "oauth_error=zernio_no_account", pending?.oauthReturnPage)
        );
      }
      if (
        msg === "zernio_gmb_no_locations" ||
        msg === "zernio_gmb_no_location_id" ||
        msg === "zernio_gmb_select_failed"
      ) {
        return res.redirect(
          oauthRedirectTo(
            base,
            pending?.platform || "facebook",
            "oauth_error=zernio_gmb_selection_failed",
            pending?.oauthReturnPage
          )
        );
      }
      return res.redirect(
        oauthRedirectTo(base, pending?.platform || "facebook", "oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });
}
