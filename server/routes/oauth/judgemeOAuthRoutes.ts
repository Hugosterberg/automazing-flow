/**
 * Judge.me connect (private API token + shop domain — no OAuth).
 * Registered via registerOAuthRoutes → registerJudgemeOAuthRoutes.
 *
 * Two entry points, mirroring the Tripadvisor official-API flow:
 *   GET  /api/auth/judgeme                — synchronous connect using
 *        JUDGEME_SHOP_DOMAIN + JUDGEME_API_TOKEN from per-tenant secrets/.env.
 *   POST /api/auth/judgeme/manual-connect — connect with credentials from the
 *        in-app dialog. Credentials are verified against the live API before
 *        the account is stored.
 */

import {
  profileScopedAccountId,
  pruneDuplicateAccountEntries,
} from "../../lib/accountIdentity.ts";
import {
  normalizeJudgemeShopDomain,
  verifyJudgemeCredentials,
} from "../../providers/judgeme.ts";
import {
  normalizeRequestedProfileId,
  profileParam,
  requestBusinessProfileId,
} from "./helpers.ts";
import type { CommerceOAuthRouteCtx } from "./shopifyOAuthRoutes.ts";
import type { OAuthRoutesDeps } from "./types.ts";

export type JudgemeOAuthRouteCtx = CommerceOAuthRouteCtx;

export function registerJudgemeOAuthRoutes(
  app: {
    get: (...args: unknown[]) => unknown;
    post: (...args: unknown[]) => unknown;
  },
  deps: OAuthRoutesDeps,
  ctx: JudgemeOAuthRouteCtx
): void {
  const { BASE_URL, tokenStore, getSessionUserId, secretResolver } = deps;
  const { parseOauthReturnPage, requireSessionOrRedirect, requestedAppBaseUrl, oauthRedirectTo } = ctx;

  async function storeJudgemeAccount(options: {
    userId: string;
    profileId: string | null;
    shopDomain: string;
    apiToken: string;
  }) {
    const { userId, profileId, shopDomain, apiToken } = options;
    // Stable id per shop: reconnecting overwrites instead of duplicating.
    const accountId = profileScopedAccountId("jm", shopDomain, profileId);
    await tokenStore.set(accountId, {
      platform: "judgeme",
      ownerUserId: userId,
      profileId,
      username: shopDomain,
      accessToken: null,
      judgemeShopDomain: shopDomain,
      judgemeApiToken: apiToken,
    });
    await pruneDuplicateAccountEntries({
      tokenStore,
      platform: "judgeme",
      keepAccountId: accountId,
      matchers: [{ key: "judgemeShopDomain", value: shopDomain }],
      sameProfileId: profileId || null,
    });
    return accountId;
  }

  // --- Judge.me connect (per-tenant secrets / env fallback) ---
  app.get("/api/auth/judgeme", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "reviews";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    // Synchronous connect resolves on this same request, so return the user
    // to the origin they came from rather than a hardcoded BASE_URL.
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const judgemeBp = requestBusinessProfileId(req);

    const shopDomain = normalizeJudgemeShopDomain(
      String(req.query.shop_domain || (await secretResolver.resolve(judgemeBp, "JUDGEME_SHOP_DOMAIN")) || "")
    );
    const apiToken = String((await secretResolver.resolve(judgemeBp, "JUDGEME_API_TOKEN")) || "").trim();
    if (!shopDomain || !apiToken) {
      const missing = [
        !shopDomain ? "JUDGEME_SHOP_DOMAIN" : "",
        !apiToken ? "JUDGEME_API_TOKEN" : "",
      ].filter(Boolean);
      return res.redirect(
        oauthRedirectTo(
          base,
          "judgeme",
          `oauth_error=judgeme_not_configured&oauth_hint=${encodeURIComponent(
            `Missing ${missing.join(" and ")}. Add them in Preferences -> API keys, or use the Judge.me connect dialog (shop domain + private API token from Judge.me admin -> Settings -> Integrations).`
          )}`,
          returnPage
        )
      );
    }

    const verified = await verifyJudgemeCredentials({ shopDomain, apiToken });
    if (!verified.ok) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "judgeme",
          `oauth_error=judgeme_rejected&oauth_hint=${encodeURIComponent(verified.error)}`,
          returnPage
        )
      );
    }

    const accountId = await storeJudgemeAccount({ userId, profileId: ourProfileId, shopDomain, apiToken });
    const profileQuery = profileParam(ourProfileId);
    const postPage = returnPage === "connections" ? "connections" : "reviews";
    return res.redirect(
      `${base}/${postPage}?oauth_success=1&platform=judgeme&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(shopDomain)}${profileQuery}`
    );
  });

  app.post("/api/auth/judgeme/manual-connect", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const shopDomain = normalizeJudgemeShopDomain(String(req.body?.shopDomain || ""));
    const profileId = String(req.body?.profileId || "").trim() || null;
    const apiToken =
      String(req.body?.apiToken || "").trim() ||
      String((await secretResolver.resolve(requestBusinessProfileId(req), "JUDGEME_API_TOKEN")) || "").trim();
    if (!shopDomain) {
      return res.status(400).json({ error: "shopDomain is required (the store's myshopify.com domain)" });
    }
    if (!apiToken) {
      return res.status(400).json({
        error:
          "Judge.me private API token is required (Judge.me admin -> Settings -> Integrations -> View API tokens).",
      });
    }

    const verified = await verifyJudgemeCredentials({ shopDomain, apiToken });
    if (!verified.ok) {
      return res.status(verified.status === 401 || verified.status === 403 ? 401 : 502).json({ error: verified.error });
    }

    const accountId = await storeJudgemeAccount({ userId, profileId, shopDomain, apiToken });
    return res.json({
      ok: true,
      account_id: accountId,
      platform: "judgeme",
      username: shopDomain,
      ...(profileId ? { profile_id: profileId } : {}),
    });
  });
}
