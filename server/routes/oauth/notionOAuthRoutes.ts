/**
 * Notion OAuth routes.
 * Registered via registerOAuthRoutes → registerNotionOAuthRoutes.
 */

import crypto from "crypto";
import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { NOTION_AUTH, NOTION_TOKEN } from "./constants.ts";
import {
  normalizeRequestedProfileId,
  profileParam,
} from "./helpers.ts";
import type { MailOAuthRouteCtx } from "./mailOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export type CommerceOAuthRouteCtx = {
  parseOauthReturnPage: MailOAuthRouteCtx["parseOauthReturnPage"];
  requireSessionOrRedirect: MailOAuthRouteCtx["requireSessionOrRedirect"];
  requestedAppBaseUrl: MailOAuthRouteCtx["requestedAppBaseUrl"];
  postOauthBaseUrl: MailOAuthRouteCtx["postOauthBaseUrl"];
  postOauthPage: MailOAuthRouteCtx["postOauthPage"];
  isAllowedOAuthCallbackUser: MailOAuthRouteCtx["isAllowedOAuthCallbackUser"];
  oauthRedirectTo: (
    baseUrl: string,
    platform: string,
    query: string,
    returnPage?: string | null
  ) => string;
};

export function registerNotionOAuthRoutes(
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

  function getNotionPublicBaseUrl() {
    const raw = String(process.env.NOTION_APP_URL || API_BASE_URL || "").trim();
    return raw.replace(/\/$/, "");
  }

  // --- Notion OAuth ---
  app.get("/api/auth/notion", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "ecommerce";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;

    const clientId = String(process.env.NOTION_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=notion_not_configured", returnPage));
    }

    const notionPublicBase = getNotionPublicBaseUrl();
    if (!/^https:\/\//i.test(notionPublicBase)) {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=notion_public_url_must_be_https", returnPage));
    }
    const redirectUri = `${notionPublicBase}/api/auth/notion/callback`;

    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "notion",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });

    const url = new URL(NOTION_AUTH);
    url.searchParams.set("owner", "user");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/notion/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "notion",
          buildOAuthCallbackErrorQuery(error, errorDescription, "notion"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending || pending.platform !== "notion") {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=invalid_state"));
    }

    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);

    const clientId = String(process.env.NOTION_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.NOTION_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.redirect(oauthRedirectTo(base, "notion","oauth_error=notion_not_configured", pending.oauthReturnPage));
    }

    try {
      const notionPublicBase = getNotionPublicBaseUrl();
      const redirectUri = `${notionPublicBase}/api/auth/notion/callback`;
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(NOTION_TOKEN, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: String(code || ""),
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData?.access_token) {
        const rawErr = tokenData?.error || tokenData?.message || "token_exchange_failed";
        return res.redirect(
          oauthRedirectTo(base, "notion",`oauth_error=${encodeURIComponent(String(rawErr))}`, pending.oauthReturnPage)
        );
      }

      const workspaceId = String(tokenData.workspace_id || tokenData.bot_id || "").trim();
      // Stable id per Notion workspace: reconnecting overwrites instead of duplicating.
      const accountId = workspaceId
        ? profileScopedAccountId("notion", workspaceId, pending.profileId)
        : crypto.randomUUID();
      const workspaceName = String(tokenData.workspace_name || "Notion Workspace");

      await tokenStore.set(accountId, {
        platform: "notion",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        botId: tokenData.bot_id,
      });
      await pruneDuplicateAccountEntries({
        tokenStore,
        platform: "notion",
        keepAccountId: accountId,
        matchers: [
          { key: "workspaceId", value: tokenData.workspace_id ? String(tokenData.workspace_id) : null },
          { key: "botId", value: tokenData.bot_id ? String(tokenData.bot_id) : null },
        ],
        sameProfileId: pending.profileId || null,
      });

      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "notion");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=notion&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(workspaceName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Notion OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "notion","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
