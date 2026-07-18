/**
 * Fortnox OAuth routes (authorization code flow, offline access).
 * Registered via registerOAuthRoutes → registerFortnoxOAuthRoutes.
 *
 * Fortnox tokens: access token ~1h, refresh token 45 days (rotates on every
 * refresh — the provider persists the new one). Scopes grant read+write per
 * resource, so we request only `companyinformation invoice` for the Economy
 * panel.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { fetchFortnoxCompanyInformation } from "../../providers/fortnox.ts";
import { FORTNOX_AUTH, FORTNOX_SCOPES, FORTNOX_TOKEN } from "./constants.ts";
import { normalizeRequestedProfileId, profileParam } from "./helpers.ts";
import type { CommerceOAuthRouteCtx } from "./notionOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export function registerFortnoxOAuthRoutes(
  app: { get: (...args: unknown[]) => unknown },
  deps: OAuthRoutesDeps,
  ctx: CommerceOAuthRouteCtx
): void {
  const { BASE_URL, API_BASE_URL, generateState, oauthPendingStore, tokenStore, getSessionUserId } =
    deps;
  const {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    postOauthBaseUrl,
    postOauthPage,
    isAllowedOAuthCallbackUser,
    oauthRedirectTo,
  } = ctx;

  function fortnoxRedirectUri(): string {
    const base = String(process.env.FORTNOX_APP_URL || API_BASE_URL || "").trim().replace(/\/$/, "");
    return `${base}/api/auth/fortnox/callback`;
  }

  app.get("/api/auth/fortnox", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "company";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;

    const clientId = String(process.env.FORTNOX_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "fortnox", "oauth_error=fortnox_not_configured", returnPage));
    }

    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "fortnox",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: returnPage,
    });

    const url = new URL(FORTNOX_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", fortnoxRedirectUri());
    url.searchParams.set("scope", FORTNOX_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("response_type", "code");
    res.redirect(url.toString());
  });

  app.get("/api/auth/fortnox/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "fortnox",
          buildOAuthCallbackErrorQuery(error, errorDescription, "fortnox"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending || pending.platform !== "fortnox") {
      return res.redirect(oauthRedirectTo(base, "fortnox", "oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "fortnox", "oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = String(process.env.FORTNOX_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.FORTNOX_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "fortnox", "oauth_error=fortnox_not_configured", pending.oauthReturnPage));
    }

    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(FORTNOX_TOKEN, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(code || ""),
          redirect_uri: fortnoxRedirectUri(),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const tokenData = (await tokenRes.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (!tokenRes.ok || !tokenData?.access_token) {
        const rawErr = tokenData?.error_description || tokenData?.error || "token_exchange_failed";
        return res.redirect(
          oauthRedirectTo(base, "fortnox", `oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage)
        );
      }

      const company = await fetchFortnoxCompanyInformation(tokenData.access_token);
      const orgNumber = company?.organizationNumber || "";
      // Stable id per Fortnox company: reconnecting overwrites instead of duplicating.
      const accountId = orgNumber
        ? profileScopedAccountId("fortnox", orgNumber, pending.profileId)
        : crypto.randomUUID();
      const companyName = company?.companyName || "Fortnox";

      await tokenStore.set(accountId, {
        platform: "fortnox",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : undefined,
        companyName,
        organizationNumber: orgNumber || undefined,
        scope: FORTNOX_SCOPES,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "fortnox",
        keepAccountId: accountId,
        matchers: [{ key: "organizationNumber", value: orgNumber || null }],
        sameProfileId: pending.profileId || null,
      });

      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "fortnox");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=fortnox&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(companyName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Fortnox OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "fortnox", "oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
