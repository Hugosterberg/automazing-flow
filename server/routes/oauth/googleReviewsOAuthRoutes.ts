/**
 * Google Reviews OAuth routes (official + optional Zernio auto path).
 * Registered via registerOAuthRoutes → registerGoogleReviewsOAuthRoutes.
 */

import { profileScopedAccountId } from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import {
  GOOGLE_AUTH,
  GOOGLE_REVIEWS_SCOPES,
  GOOGLE_TOKEN,
} from "./constants.ts";
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

export type GoogleReviewsOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
  getOptionalZernioProfileId: (
    label: string,
    businessProfileId?: string | null
  ) => Promise<string | null>;
};

export function registerGoogleReviewsOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: GoogleReviewsOAuthRouteCtx
): void {
  const {
    BASE_URL,
    ZERNIO_API_BASE,
    getZernioApiKey,
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
    getOptionalZernioProfileId,
  } = ctx;

  // --- Google Reviews OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/google_reviews", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "reviews";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    let zernioAutoFailure: unknown = null;

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOptionalZernioProfileId(
            "google_reviews",
            requestBusinessProfileId(req)
          );
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "google_reviews",
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
            platformSlugs: ["google-reviews", "google_reviews", "google-business-reviews"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "google_reviews",zernioOauthErrorQuery(e), returnPage));
          }
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "google_reviews","oauth_error=zernio_not_configured", returnPage));
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_reviews",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=google_reviews_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "google_reviews",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google-reviews/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_REVIEWS_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google-reviews/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_reviews",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_reviews"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "google_reviews","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "google_reviews","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        oauthRedirectTo(base, "google_reviews","oauth_error=google_reviews_not_configured", pending.oauthReturnPage)
      );
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google-reviews/callback");
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
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_reviews",
            `oauth_error=${encodeURIComponent(String(tokenData.error || "token_exchange_failed"))}`,
            pending.oauthReturnPage
          )
        );
      }

      const headers = { Authorization: `Bearer ${tokenData.access_token}` };
      // Primary API: account management v1. Fallback: legacy v4 for tenants with partial migration.
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers, signal: AbortSignal.timeout(15_000) });
      const accountsBody = await accountsRes.json().catch(() => ({}));
      let accounts = Array.isArray(accountsBody.accounts) ? accountsBody.accounts : [];
      if ((!accounts || accounts.length === 0) && accountsRes.ok) {
        const legacyAccountsRes = await fetch("https://mybusiness.googleapis.com/v4/accounts", { headers, signal: AbortSignal.timeout(15_000) });
        const legacyAccountsBody = await legacyAccountsRes.json().catch(() => ({}));
        const legacyAccounts = Array.isArray(legacyAccountsBody.accounts) ? legacyAccountsBody.accounts : [];
        if (legacyAccounts.length > 0) {
          accounts = legacyAccounts;
        }
      }
      if (!accountsRes.ok && (!accounts || accounts.length === 0)) {
        const errHint = encodeURIComponent(String(accountsBody?.error?.message || accountsBody?.error || "accounts_api_failed"));
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_reviews",
            `oauth_error=google_reviews_accounts_api_failed&oauth_hint=${errHint}`,
            pending.oauthReturnPage
          )
        );
      }
      const firstAccount = accounts[0] || null;
      const accountNamePath = String(firstAccount?.name || "");
      const accountId = accountNamePath.split("/")[1] || "";
      if (!accountId) {
        return res.redirect(
          oauthRedirectTo(base, "google_reviews","oauth_error=google_reviews_no_account_access", pending.oauthReturnPage)
        );
      }

      const locationsRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountNamePath}/locations?pageSize=20&readMask=name,title`,
        { headers, signal: AbortSignal.timeout(15_000) }
      );
      const locationsBody = await locationsRes.json().catch(() => ({}));
      let locations = Array.isArray(locationsBody.locations) ? locationsBody.locations : [];
      if ((!locations || locations.length === 0) && locationsRes.ok) {
        const legacyLocationsRes = await fetch(
          `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations?pageSize=20`,
          { headers, signal: AbortSignal.timeout(15_000) }
        );
        const legacyLocationsBody = await legacyLocationsRes.json().catch(() => ({}));
        const legacyLocations = Array.isArray(legacyLocationsBody.locations) ? legacyLocationsBody.locations : [];
        if (legacyLocations.length > 0) {
          locations = legacyLocations;
        }
      }
      if (!locationsRes.ok && (!locations || locations.length === 0)) {
        const errHint = encodeURIComponent(String(locationsBody?.error?.message || locationsBody?.error || "locations_api_failed"));
        return res.redirect(
          oauthRedirectTo(
            base,
            "google_reviews",
            `oauth_error=google_reviews_locations_api_failed&oauth_hint=${errHint}`,
            pending.oauthReturnPage
          )
        );
      }
      const firstLocation = locations[0] || null;
      const locationNamePath = String(firstLocation?.name || "");
      const locationId = locationNamePath.split("/").pop() || "";
      const locationTitle = String(firstLocation?.title || firstLocation?.locationName || firstLocation?.storeCode || "Google location");
      if (!locationId) {
        return res.redirect(
          oauthRedirectTo(base, "google_reviews","oauth_error=google_reviews_no_location_access", pending.oauthReturnPage)
        );
      }

      const appAccountId = profileScopedAccountId(
        "grev",
        `${accountId}:${locationId}`,
        pending.profileId
      );
      await tokenStore.set(appAccountId, {
        platform: "google_reviews",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: locationTitle,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        googleBusinessAccountId: accountId,
        googleBusinessLocationId: locationId,
        googleBusinessLocationName: locationTitle,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_reviews");
      return res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=google_reviews&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(locationTitle)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Reviews OAuth error:", err);
      return res.redirect(
        oauthRedirectTo(base, "google_reviews","oauth_error=token_exchange_failed", pending.oauthReturnPage)
      );
    }
  });
}
