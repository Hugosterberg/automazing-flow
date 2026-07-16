/**
 * Google Calendar OAuth routes (official + optional Zernio auto path).
 * Registered via registerOAuthRoutes → registerGoogleCalendarOAuthRoutes.
 */

import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import {
  GOOGLE_AUTH,
  GOOGLE_CALENDAR_SCOPES,
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

export type GoogleCalendarOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
};

export function registerGoogleCalendarOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: GoogleCalendarOAuthRouteCtx
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
    oauthRedirectTo,
    oauthCallbackUrl,
  } = ctx;

  // --- Google Calendar OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/google_calendar", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "calendar";
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
          const zernioProfileId = await getOrCreateZernioProfileId(requestBusinessProfileId(req));
          if (!zernioProfileId) {
            return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=zernio_profile_failed", returnPage));
          }
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "google_calendar",
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
            platformSlugs: ["google-calendar", "google_calendar", "google-workspace-calendar", "google-workspace"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "google_calendar",zernioOauthErrorQuery(e), returnPage));
          }
          // auto: remember WHY Zernio refused before falling back to official —
          // if official isn't configured the user must see the Zernio reason,
          // not a misleading "not configured".
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=zernio_not_configured", returnPage));
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_calendar",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=google_calendar_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "google_calendar",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google-calendar/callback");
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google-calendar/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "google_calendar",
          buildOAuthCallbackErrorQuery(error, errorDescription, "google_calendar"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=invalid_state"));
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
      return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=google_calendar_not_configured", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google-calendar/callback");
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
        return res.redirect(oauthRedirectTo(base, "google_calendar",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      let username = "Google Calendar";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = meData.email;
      const identityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gcal", identityRaw, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "google_calendar",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // Clean up legacy random-id entries for the same calendar account.
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "google_calendar",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: meData.email ? String(meData.email) : null }],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_calendar");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=google_calendar&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Calendar OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "google_calendar","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
