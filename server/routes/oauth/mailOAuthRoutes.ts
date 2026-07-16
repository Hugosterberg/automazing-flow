/**
 * Gmail, Google Drive, and Outlook (mail) OAuth routes.
 * Registered via registerOAuthRoutes → registerMailOAuthRoutes.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import {
  GMAIL_SCOPES,
  GOOGLE_AUTH,
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_TOKEN,
} from "./constants.ts";
import {
  buildContentUrl,
  normalizeRequestedProfileId,
  profileParam,
  sendPopupOAuthResult,
} from "./helpers.ts";
import type {
  OAuthErrorExtras,
  OAuthPendingRecord,
  OAuthRoutesDeps,
} from "./types.ts";

export interface MailOAuthRouteCtx {
  debugLog: (
    runId: string,
    hypothesisId: string,
    location: string,
    message: string,
    data?: Record<string, unknown>
  ) => void;
  buildPageUrlWithBase: (
    baseUrl: string,
    page: string,
    params?: Record<string, unknown>
  ) => string;
  buildOauthErrorParams: (
    errorCode: string,
    extras?: OAuthErrorExtras
  ) => Record<string, unknown>;
  oauthCallbackUrl: (req: unknown, callbackPath: string) => string;
  requestedAppBaseUrl: (req: unknown) => string | null;
  requireSessionOrRedirect: (req: unknown, res: unknown, page: string) => string | null;
  oauthPageForPlatform: (platform: string) => string;
  parseOauthReturnPage: (req: unknown) => string | null;
  postOauthBaseUrl: (pending: OAuthPendingRecord | null | undefined) => string;
  postOauthPage: (pending: OAuthPendingRecord | null | undefined, platform: string) => string;
  isAllowedOAuthCallbackUser: (
    pending: OAuthPendingRecord | null | undefined,
    callbackUserId: string | null
  ) => boolean;
}

function getExceptionMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildPopupOauthErrorPayload(errorCode: string, extras: OAuthErrorExtras = {}) {
  return {
    type: "google_drive_oauth",
    error: errorCode,
    statusCode: extras.status ? String(extras.status) : null,
    exception: extras.exception ? String(extras.exception) : null,
    hint: extras.hint ? String(extras.hint) : null,
  };
}

export function registerMailOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: MailOAuthRouteCtx
): void {
  const {
    BASE_URL,
    generateState,
    oauthPendingStore,
    tokenStore,
    getSessionUserId,
  } = deps;
  const {
    debugLog,
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
  } = ctx;

  function getGmailRedirectUri(req?: unknown) {
    return oauthCallbackUrl(req, "/api/auth/google/callback");
  }

  function buildPendingMessagesUrl(
    pending: OAuthPendingRecord | null | undefined,
    params: Record<string, unknown>
  ) {
    return buildPageUrlWithBase(postOauthBaseUrl(pending), postOauthPage(pending, "gmail"), params);
  }

  // --- Gmail OAuth (samma Google OAuth, andra scopes) ---
  app.get("/api/auth/gmail", async (req, res) => {
    const appBaseUrl = requestedAppBaseUrl(req);
    const returnPage = parseOauthReturnPage(req) || "messages";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    debugLog("pre-fix", "H1", "oauthRoutes.js:/api/auth/gmail", "Gmail OAuth init hit", {
      hasUserId: Boolean(userId),
      profileIdPresent: Boolean(normalizeRequestedProfileId(req.query.profile_id)),
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, buildOauthErrorParams("gmail_not_configured", {
          status: 500,
          exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
        }))
      );
    }
    const state = generateState();
    const redirectUri = getGmailRedirectUri(req);
    await oauthPendingStore.set(state, {
      platform: "gmail",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      redirectUri,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GMAIL_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_drive", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "content";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      const params = buildOauthErrorParams("google_drive_not_configured", {
        status: 500,
        exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
      });
      if (req.query.popup === "1") {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          }),
          buildContentUrl(BASE_URL, params),
          BASE_URL
        );
      }
      return res.redirect(buildPageUrlWithBase(requestedAppBaseUrl(req) || BASE_URL, returnPage, params));
    }
    const state = generateState();
    const redirectUri = oauthCallbackUrl(req, "/api/auth/google_drive/callback");
    await oauthPendingStore.set(state, {
      platform: "google_drive",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      popup: req.query.popup === "1",
      appBaseUrl: requestedAppBaseUrl(req),
      redirectUri,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_drive/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    const returnBase = postOauthBaseUrl(pending);
    if (error) {
      const errorCode = String(error);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload(errorCode),
          buildContentUrl(returnBase, buildOauthErrorParams(errorCode)),
          returnBase
        );
      }
      return res.redirect(buildPageUrlWithBase(returnBase, postOauthPage(pending, "google_drive"), buildOauthErrorParams(errorCode)));
    }
    if (!pending) {
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          oauthPageForPlatform("google_drive"),
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state was missing or expired.",
          })
        )
      );
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
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          }),
          buildContentUrl(
            returnBase,
            buildOauthErrorParams("invalid_state", {
              status: 400,
              exception: "OAuth state did not match the active session.",
            })
          ),
          returnBase
        );
      }
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          postOauthPage(pending, "google_drive"),
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          })
        )
      );
    }
    await oauthPendingStore.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          }),
          buildContentUrl(
            returnBase,
            buildOauthErrorParams("google_drive_not_configured", {
              status: 500,
              exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
            })
          ),
          returnBase
        );
      }
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          postOauthPage(pending, "google_drive"),
          buildOauthErrorParams("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          })
        )
      );
    }

    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/google_drive/callback");
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
        const errorCode = String(data.error_description || data.error || "token_exchange_failed");
        if (pending?.popup) {
          return sendPopupOAuthResult(
            res,
            buildPopupOauthErrorPayload(errorCode, {
              status: tokenRes.status,
              exception: data.error_description || data.error || "Google token exchange failed.",
            }),
            buildContentUrl(
              returnBase,
              buildOauthErrorParams(errorCode, {
                status: tokenRes.status,
                exception: data.error_description || data.error || "Google token exchange failed.",
              })
            ),
            returnBase
          );
        }
        return res.redirect(
          buildPageUrlWithBase(
            returnBase,
            postOauthPage(pending, "google_drive"),
            buildOauthErrorParams(errorCode, {
              status: tokenRes.status,
              exception: data.error_description || data.error || "Google token exchange failed.",
            })
          )
        );
      }

      let username = "Google Drive";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = String(meData.email);
      const driveIdentityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gdrive", driveIdentityRaw, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "google_drive",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // Clean up legacy random-id entries for the same Drive account.
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "google_drive",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: meData.email ? String(meData.email) : null }],
        sameProfileId: pending.profileId || null,
      });
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          {
            type: "google_drive_oauth",
            success: true,
            platform: "google_drive",
            account_id: accountId,
            username,
            ...(pending.profileId ? { profile_id: pending.profileId } : {}),
          },
          buildContentUrl(returnBase, {
            oauth_success: 1,
            platform: "google_drive",
            account_id: accountId,
            username,
            profile_id: pending.profileId,
          }),
          returnBase
        );
      }
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "google_drive");
      return res.redirect(
        `${returnBase}/${postPage}?oauth_success=1&platform=google_drive&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Drive OAuth error:", err);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          }),
          buildContentUrl(
            returnBase,
            buildOauthErrorParams("token_exchange_failed", {
              status: 500,
              exception: getExceptionMessage(err),
            })
          ),
          returnBase
        );
      }
      return res.redirect(
        buildPageUrlWithBase(
          returnBase,
          postOauthPage(pending, "google_drive"),
          buildOauthErrorParams("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          })
        )
      );
    }
  });

  async function handleGmailCallback(req, res) {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Gmail callback received", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      error: error ? String(error) : null,
    });
    if (error) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: String(error) }));
    }
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Pending state lookup", {
      pendingFound: Boolean(pending),
      pendingPlatform: pending?.platform ?? null,
    });
    if (!pending) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Callback user/session validation", {
      callbackUserIdPrefix: callbackUserIdStr ? callbackUserIdStr.slice(0, 14) : null,
      pendingUserIdPrefix: pendingUserId ? pendingUserId.slice(0, 14) : null,
      matches: Boolean(callbackUserIdStr && pendingUserId && callbackUserIdStr === pendingUserId),
      isLocalToCloudTransition,
    });
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      await oauthPendingStore.delete(state);
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    if (isLocalToCloudTransition) {
      debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Allowing local-to-cloud transition", {
        callbackUserIdPrefix: callbackUserIdStr.slice(0, 14),
        pendingUserIdPrefix: pendingUserId.slice(0, 14),
      });
    }
    if (!callbackUserId) {
      debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Proceeding without callback cookie session", {
        fallbackToPendingUserIdPrefix: pending?.userId ? String(pending.userId).slice(0, 14) : null,
      });
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPendingMessagesUrl(pending, buildOauthErrorParams("gmail_not_configured", {
          status: 500,
          exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
        }))
      );
    }
    try {
      const redirectUri = typeof pending.redirectUri === "string" ? pending.redirectUri : getGmailRedirectUri(req);
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      debugLog("pre-fix", "H3", "oauthRoutes.js:/api/auth/gmail/callback", "Google token exchange response", {
        status: tokenRes.status,
        ok: tokenRes.ok,
        hasAccessToken: Boolean(data.access_token),
        hasRefreshToken: Boolean(data.refresh_token),
        tokenError: data.error ?? null,
      });
      if (!tokenRes.ok || data.error || !data.access_token) {
        const rawErr = data.error_description || data.error || "token_exchange_failed";
        return res.redirect(
          buildPendingMessagesUrl(pending, buildOauthErrorParams(String(rawErr), {
            status: tokenRes.status,
            exception: data.error_description || data.error || "Google token exchange failed.",
          }))
        );
      }
      let username = "Gmail";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = meData.email;
      const gmailIdentityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = profileScopedAccountId("gmail", gmailIdentityRaw, pending.profileId);
      debugLog("pre-fix", "H3", "oauthRoutes.js:/api/auth/gmail/callback", "Resolved stable Gmail account id", {
        hasGoogleUserId: Boolean(meData.id),
        hasEmail: Boolean(meData.email),
        accountId,
      });
      await tokenStore.set(accountId, {
        platform: "gmail",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // Clean up legacy random-id entries for the same mailbox.
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "gmail",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: meData.email ? String(meData.email) : null }],
        sameProfileId: pending.profileId || null,
      });
      const postPage = postOauthPage(pending, "gmail");
      res.redirect(
        buildPageUrlWithBase(postOauthBaseUrl(pending), postPage, {
          oauth_success: 1,
          platform: "gmail",
          account_id: accountId,
          username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error("Gmail OAuth error:", err);
      res.redirect(
        buildPendingMessagesUrl(pending, buildOauthErrorParams("token_exchange_failed", {
          status: 500,
          exception: getExceptionMessage(err),
        }))
      );
    }
  }

  app.get("/api/auth/gmail/callback", handleGmailCallback);
  app.get("/api/auth/google/callback", handleGmailCallback);

  // --- Outlook OAuth (Microsoft) ---
  app.get("/api/auth/outlook", async (req, res) => {
    const appBaseUrl = requestedAppBaseUrl(req);
    const returnPage = parseOauthReturnPage(req) || "messages";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(
        buildPageUrlWithBase(appBaseUrl || BASE_URL, returnPage, { oauth_error: "outlook_not_configured" })
      );
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "outlook",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook/callback");
    const scope = "offline_access openid profile email User.Read Mail.ReadWrite Mail.Send";
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pending = await oauthPendingStore.get(state);
    if (error) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: String(error) }));
    }
    if (!pending) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    const callbackUserId = getSessionUserId(req);
    if (!isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "invalid_state" }));
    }
    await oauthPendingStore.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "outlook_not_configured" }));
    }
    try {
      const redirectUri = oauthCallbackUrl(req, "/api/auth/outlook/callback");
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
        return res.redirect(buildPendingMessagesUrl(pending, { oauth_error: String(rawErr) }));
      }
      let username = "Outlook";
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
        ? profileScopedAccountId("outlook", msIdentity, pending.profileId)
        : crypto.randomUUID();
      await tokenStore.set(accountId, {
        platform: "outlook",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "outlook",
        keepAccountId: accountId,
        matchers: [{ key: "username", value: username !== "Outlook" ? username : null }],
        sameProfileId: pending.profileId || null,
      });
      const postPage = postOauthPage(pending, "outlook");
      res.redirect(
        buildPageUrlWithBase(pending.appBaseUrl || BASE_URL, postPage, {
          oauth_success: 1,
          platform: "outlook",
          account_id: accountId,
          username,
          profile_id: pending.profileId || undefined,
        })
      );
    } catch (err) {
      console.error("Outlook OAuth error:", err);
      res.redirect(buildPendingMessagesUrl(pending, { oauth_error: "token_exchange_failed" }));
    }
  });
}
