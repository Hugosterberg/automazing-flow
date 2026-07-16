/**
 * Shopify OAuth routes.
 * Registered via registerOAuthRoutes → registerShopifyOAuthRoutes.
 */

import crypto from "crypto";
import { profileScopedAccountId } from "../../lib/accountIdentity.ts";
import { buildOAuthCallbackErrorQuery } from "../../lib/oauthPermissionErrors.ts";
import { getShopifyScopes, getShopifyScopeDiagnostics } from "../../lib/shopifyScopes.ts";
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

export function registerShopifyOAuthRoutes(
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

  function getShopifyPublicBaseUrl() {
    const raw = String(process.env.SHOPIFY_APP_URL || API_BASE_URL || "").trim();
    return raw.replace(/\/$/, "");
  }

  // --- Shopify OAuth (kräver shop-parameter: mittbutik.myshopify.com) ---
  // Shop handles: 3-60 chars, lowercase letters/digits/hyphens, cannot start or end with hyphen.
  function normalizeShopifyShop(raw: unknown): string | null {
    if (!raw) return null;
    const trimmed = String(raw).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!trimmed) return null;
    const handle = trimmed.replace(/\.myshopify\.com$/, "");
    if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(handle)) return null;
    return `${handle}.myshopify.com`;
  }
  const SHOPIFY_SCOPES = getShopifyScopes();
  app.get("/api/auth/shopify", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "ecommerce";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    const base = requestedAppBaseUrl(req) || BASE_URL;
    const clientId = process.env.SHOPIFY_API_KEY;
    if (!clientId) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_not_configured", returnPage));
    }
    const shop = normalizeShopifyShop(req.query.shop);
    if (!shop) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_invalid_shop", returnPage));
    }
    const shopifyPublicBase = getShopifyPublicBaseUrl();
    if (!shopifyPublicBase) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_public_url_missing", returnPage));
    }
    if (!/^https:\/\//i.test(shopifyPublicBase)) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_public_url_must_be_https", returnPage));
    }
    const state = generateState();
    await oauthPendingStore.set(state, {
      platform: "shopify",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      shop,
      appBaseUrl: requestedAppBaseUrl(req),
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = `${shopifyPublicBase}/api/auth/shopify/callback`;
    const shopHandle = shop.replace(/\.myshopify\.com$/, "");
    const scopeDiagnostics = getShopifyScopeDiagnostics();
    if (scopeDiagnostics.removed.length > 0) {
      console.warn(
        "[shopify-oauth] Ignored invalid Customer Account scopes from SHOPIFY_EXTRA_SCOPES:",
        scopeDiagnostics.removed.join(", ")
      );
    }
    const url = `https://${shopHandle}.myshopify.com/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.redirect(url);
  });

  /**
   * Shopify-required callback authentication: every query param except
   * `hmac`/`signature`, sorted and joined, must HMAC-SHA256 to the `hmac`
   * param under the app secret. Complements the state check (CSRF) by
   * proving the callback actually came from Shopify.
   */
  function verifyShopifyCallbackHmac(query: Record<string, unknown>, secret: string): boolean {
    const provided = String(query?.hmac || "");
    if (!provided) return false;
    const message = Object.keys(query)
      .filter((key) => key !== "hmac" && key !== "signature")
      .sort()
      .map((key) => {
        const value = query[key];
        const flat = Array.isArray(value) ? value.join(",") : String(value ?? "");
        return `${key}=${flat}`;
      })
      .join("&");
    const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(provided.toLowerCase(), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  app.get("/api/auth/shopify/callback", async (req, res) => {
    const { code, state, shop, error, error_description: errorDescription } = req.query;
    const pending = await oauthPendingStore.get(state);
    const base = postOauthBaseUrl(pending);
    if (error) {
      return res.redirect(
        oauthRedirectTo(
          base,
          "shopify",
          buildOAuthCallbackErrorQuery(error, errorDescription, "shopify"),
          pending?.oauthReturnPage
        )
      );
    }
    if (!pending) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=invalid_state"));
    }
    const callbackUserId = getSessionUserId(req);
    // Tunnel callbacks run on a different host than localhost, so callback cookies may be missing.
    // If callback user is present we still enforce strict owner match.
    if (callbackUserId && !isAllowedOAuthCallbackUser(pending, callbackUserId)) {
      await oauthPendingStore.delete(state);
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=invalid_state", pending.oauthReturnPage));
    }
    await oauthPendingStore.delete(state);
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_not_configured", pending.oauthReturnPage));
    }
    if (!verifyShopifyCallbackHmac(req.query as Record<string, unknown>, apiSecret)) {
      return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_hmac_invalid", pending.oauthReturnPage));
    }
    try {
      const shopUrl = normalizeShopifyShop(shop);
      const pendingShopUrl = normalizeShopifyShop(pending.shop);
      if (!shopUrl || !pendingShopUrl) {
        return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_invalid_shop", pending.oauthReturnPage));
      }
      if (shopUrl !== pendingShopUrl) {
        return res.redirect(oauthRedirectTo(base, "shopify","oauth_error=shopify_shop_mismatch", pending.oauthReturnPage));
      }
      const tokenRes = await fetch(`https://${shopUrl}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code: String(code || ""),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        return res.redirect(
          oauthRedirectTo(
            base,
            "shopify",
            buildOAuthCallbackErrorQuery(data.error || "token_exchange_failed", data.error_description, "shopify"),
            pending.oauthReturnPage
          )
        );
      }
      const shopName = shopUrl.replace(/\.myshopify\.com$/, "");
      // Reuse a stable account id per shop so reconnects update the same record (matches Drive/Gmail pattern).
      const accountId = profileScopedAccountId("shopify", shopUrl, pending.profileId);
      await tokenStore.set(accountId, {
        platform: "shopify",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: shopName,
        accessToken: data.access_token,
        shop: shopUrl,
        scope: data.scope || SHOPIFY_SCOPES,
      });
      const profileQuery = profileParam(pending.profileId);
      const postPage = postOauthPage(pending, "shopify");
      res.redirect(
        `${postOauthBaseUrl(pending)}/${postPage}?oauth_success=1&platform=shopify&account_id=${accountId}&username=${encodeURIComponent(shopName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Shopify OAuth error:", err);
      res.redirect(oauthRedirectTo(base, "shopify","oauth_error=token_exchange_failed", pending.oauthReturnPage));
    }
  });
}
