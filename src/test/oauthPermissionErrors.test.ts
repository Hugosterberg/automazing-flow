import { describe, expect, it } from "vitest";
import {
  buildOAuthCallbackErrorQuery,
  connectionSyncLooksLikePermissionError,
  connectionSyncPermissionFix,
  extractOAuthPermissionDetail,
  isOAuthPermissionError,
  normalizeOAuthErrorCode,
  oauthPermissionGuidance,
} from "../../server/lib/oauthPermissionErrors.ts";

describe("oauthPermissionErrors", () => {
  it("normalizes Shopify missing permission codes", () => {
    expect(normalizeOAuthErrorCode("missing_shopify_permission", "customer_read_quick_sale")).toBe(
      "missing_shopify_permission"
    );
  });

  it("normalizes generic provider permission codes to scope_not_granted", () => {
    expect(normalizeOAuthErrorCode("invalid_scope", null)).toBe("scope_not_granted");
    expect(normalizeOAuthErrorCode("missing_meta_permission", null)).toBe("scope_not_granted");
  });

  it("detects permission-related OAuth failures", () => {
    expect(isOAuthPermissionError("access_denied", null)).toBe(true);
    expect(isOAuthPermissionError("some_unknown_code", "insufficient permissions for ads_read")).toBe(true);
    expect(isOAuthPermissionError("shopify_not_configured", null)).toBe(false);
  });

  it("extracts scope detail from hints", () => {
    expect(extractOAuthPermissionDetail("customer_read_quick_sale", null)).toBe("customer_read_quick_sale");
    expect(extractOAuthPermissionDetail("Missing scope: read_orders", null)).toBe("read_orders");
  });

  it("builds callback query with normalized code and hint", () => {
    const query = buildOAuthCallbackErrorQuery("invalid_scope", "read_orders not approved", "shopify");
    expect(query).toContain("oauth_error=scope_not_granted");
    expect(query).toContain("oauth_hint=read_orders");
  });

  it("returns Shopify guidance for missing permission errors", () => {
    const guidance = oauthPermissionGuidance({
      code: "missing_shopify_permission",
      hint: "customer_read_quick_sale",
      platform: "shopify",
    });
    expect(guidance?.title).toMatch(/Shopify/i);
    expect(guidance?.steps.length).toBeGreaterThan(2);
  });

  it("returns Google guidance for access_denied", () => {
    const guidance = oauthPermissionGuidance({
      code: "access_denied",
      hint: "The user did not grant all requested scopes",
      platform: "gmail",
    });
    expect(guidance?.title).toMatch(/Google/i);
  });

  it("detects runtime sync permission failures", () => {
    expect(connectionSyncLooksLikePermissionError("Shopify token invalid while loading orders. Reconnect to grant read_products.")).toBe(true);
    expect(connectionSyncPermissionFix("shopify", "403 forbidden scope read_orders")).toMatch(/Shopify-behörighet/i);
  });
});
