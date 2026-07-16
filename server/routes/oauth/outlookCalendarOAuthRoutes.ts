/**
 * Outlook Calendar OAuth routes (official + optional Zernio auto path).
 * Registered via registerOAuthRoutes → registerOutlookCalendarOAuthRoutes.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { OUTLOOK_CALENDAR_SCOPES } from "./constants.ts";
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

export type OutlookCalendarOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
};

export function registerOutlookCalendarOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: OutlookCalendarOAuthRouteCtx
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

  // --- Outlook Calendar OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/outlook_calendar", async (req, res) => {
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
            return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=zernio_profile_failed", returnPage));
          }
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "outlook_calendar",
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
            platformSlugs: ["outlook-calendar", "outlook_calendar", "microsoft-calendar", "microsoft-outlook-calendar"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "outlook_calendar",zernioOauthErrorQuery(e), returnPage));
          }
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=zernio_not_configured", returnPage));
      }
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "outlook_calendar",
          zernioAutoFailure ? zernioOauthErrorQuery(zernioAutoFailure) : "oauth_error=outlook_calendar_not_configured",
          returnPage
        )
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "outlook_calendar",
      userId,
      profileId: ourProfileId,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook-calendar/callback");
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(OUTLOOK_CALENDAR_SCOPES)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook-calendar/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "outlook_calendar",
          buildOAuthCallbackErrorQuery(error, errorDescription, "outlook_calendar"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=outlook_calendar_not_configured", pending.oauthReturnPage));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook-calendar/callback");
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code || ""),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(oauthRedirectTo(base, "outlook_calendar",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage));
      }
      let username = "Outlook Calendar";
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.mail) username = meData.mail;
      else if (meData.userPrincipalName) username = meData.userPrincipalName;
      const msIdentity = String(meData.id || meData.userPrincipalName || meData.mail || "").trim();
      // Stable id per Microsoft user: reconnecting overwrites instead of duplicating.
      const accountId = msIdentity
        ? profileScopedAccountId("ocal", msIdentity, pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "outlook_calendar",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "outlook_calendar",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: username !== "Outlook Calendar" ? username : null }],
        sameProfileId: pending.profileId || null,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "outlook_calendar");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=outlook_calendar&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Outlook Calendar OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "outlook_calendar","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
