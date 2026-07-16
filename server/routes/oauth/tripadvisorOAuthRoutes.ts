/**
 * Tripadvisor connect (Zernio + official API key fallback).
 * Registered via registerOAuthRoutes → registerTripadvisorOAuthRoutes.
 */

import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
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

export type TripadvisorOAuthRouteCtx = CommerceOAuthRouteCtx & {
  oauthCallbackUrl: MailOAuthRouteCtx["oauthCallbackUrl"];
  getOptionalZernioProfileId: (
    label: string,
    businessProfileId?: string | null
  ) => Promise<string | null>;
};

export function registerTripadvisorOAuthRoutes(
  app: {
    get: (...args: unknown[]) => unknown;
    post: (...args: unknown[]) => unknown;
  },
  deps: OAuthRoutesDeps,
  ctx: TripadvisorOAuthRouteCtx
): void {
  const {
    BASE_URL,
    ZERNIO_API_BASE,
    getZernioApiKey,
    generateState,
    oauthPendingStore,
    tokenStore,
    getSessionUserId,
    secretResolver,
  } = deps;
  const {
    parseOauthReturnPage,
    requireSessionOrRedirect,
    requestedAppBaseUrl,
    oauthRedirectTo,
    oauthCallbackUrl,
    getOptionalZernioProfileId,
  } = ctx;

  // --- Tripadvisor connect (Zernio + official API key fallback) ---
  app.get("/api/auth/tripadvisor", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "reviews";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    // Synchronous (env-key) connect resolves on this same request, so return
    // the user to the origin they came from rather than a hardcoded BASE_URL.
    const base = requestedAppBaseUrl(req) || BASE_URL;
    let zernioAutoFailure: unknown = null;

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOptionalZernioProfileId(
            "tripadvisor",
            requestBusinessProfileId(req)
          );
          const state = generateState();
          await oauthPendingStore.set(state, {
            platform: "tripadvisor",
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
            platformSlugs: ["tripadvisor", "trip-advisor"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          if (provider === "zernio") {
            return res.redirect(oauthRedirectTo(base, "tripadvisor", zernioOauthErrorQuery(e), returnPage));
          }
          zernioAutoFailure = e;
        }
      } else if (provider === "zernio") {
        return res.redirect(oauthRedirectTo(base, "tripadvisor", "oauth_error=zernio_not_configured", returnPage));
      }
    }

    const tripadvisorBp = requestBusinessProfileId(req);
    const apiKey = String((await secretResolver.resolve(tripadvisorBp, "TRIPADVISOR_API_KEY")) || "").trim();
    const locationId = String(
      req.query.location_id || (await secretResolver.resolve(tripadvisorBp, "TRIPADVISOR_LOCATION_ID")) || ""
    ).trim();
    if (!apiKey || !locationId) {
      if (zernioAutoFailure) {
        return res.redirect(oauthRedirectTo(base, "tripadvisor", zernioOauthErrorQuery(zernioAutoFailure), returnPage));
      }
      const missing = [
        !apiKey ? "TRIPADVISOR_API_KEY" : "",
        !locationId ? "TRIPADVISOR_LOCATION_ID" : "",
      ].filter(Boolean);
      return res.redirect(
        oauthRedirectTo(
          base,
          "tripadvisor",
          `oauth_error=tripadvisor_not_configured&oauth_hint=${encodeURIComponent(
          `Missing ${missing.join(" and ")}. Add them in .env.local or Preferences -> API keys, or use the sidebar manual connect form.`
          )}`,
          returnPage
        )
      );
    }
    // Stable id per Tripadvisor location: reconnecting overwrites instead of duplicating.
    const accountId = profileScopedAccountId("ta", locationId, ourProfileId);
    await tokenStore.set(accountId, {
      platform: "tripadvisor",
      ownerUserId: userId,
      profileId: ourProfileId,
      username: `Tripadvisor ${locationId}`,
      accessToken: null,
      tripadvisorApiKey: apiKey,
      tripadvisorLocationId: locationId,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform: "tripadvisor",
      keepAccountId: accountId,
      matchers: [{ key: "tripadvisorLocationId", value: locationId }],
      sameProfileId: ourProfileId || null,
    });
    const profileQuery = profileParam(ourProfileId);
    const postPage = returnPage === "connections" ? "connections" : "reviews";
    return res.redirect(
      `${base}/${postPage}?oauth_success=1&platform=tripadvisor&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(`Tripadvisor ${locationId}`)}${profileQuery}`
    );
  });

  app.post("/api/auth/tripadvisor/manual-connect", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const locationId = String(req.body?.locationId || "").trim();
    const providedApiKey = String(req.body?.apiKey || "").trim();
    const profileId = String(req.body?.profileId || "").trim() || null;
    const apiKey =
      providedApiKey ||
      String((await secretResolver.resolve(requestBusinessProfileId(req), "TRIPADVISOR_API_KEY")) || "").trim();
    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }
    if (!apiKey) {
      return res.status(400).json({ error: "Tripadvisor API key is required" });
    }
    // Stable id per Tripadvisor location: reconnecting overwrites instead of duplicating.
    const accountId = profileScopedAccountId("ta", locationId, profileId);
    await tokenStore.set(accountId, {
      platform: "tripadvisor",
      ownerUserId: userId,
      profileId,
      username: `Tripadvisor ${locationId}`,
      accessToken: null,
      tripadvisorApiKey: apiKey,
      tripadvisorLocationId: locationId,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform: "tripadvisor",
      keepAccountId: accountId,
      matchers: [{ key: "tripadvisorLocationId", value: locationId }],
      sameProfileId: profileId || null,
    });
    return res.json({
      ok: true,
      account_id: accountId,
      platform: "tripadvisor",
      username: `Tripadvisor ${locationId}`,
      ...(profileId ? { profile_id: profileId } : {}),
    });
  });
}
