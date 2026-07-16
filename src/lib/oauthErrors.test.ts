import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_OAUTH_ERROR_MESSAGES, formatOAuthErrorMessage, type OAuthErrorDetails } from "./oauthErrors";
import { initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  initI18n();
  await i18n.changeLanguage("sv");
});

function details(code: string): OAuthErrorDetails {
  return { code, statusCode: null, exception: null, hint: null };
}

describe("formatOAuthErrorMessage", () => {
  it("uses built-in copy for not_authenticated", () => {
    const msg = formatOAuthErrorMessage(details("not_authenticated"));
    expect(msg).toContain("Inloggningssessionen");
    expect(msg).toBe(DEFAULT_OAUTH_ERROR_MESSAGES.not_authenticated);
  });

  it("page overrides win over defaults", () => {
    const msg = formatOAuthErrorMessage(details("not_authenticated"), {
      not_authenticated: "Custom message",
    });
    expect(msg).toBe("Custom message");
  });

  it("falls back to humanized code", () => {
    const msg = formatOAuthErrorMessage(details("unknown_xyz_code"));
    expect(msg).toContain("unknown xyz code");
  });

  it("explains Shopify permission denials", () => {
    const msg = formatOAuthErrorMessage({
      ...details("missing_shopify_permission"),
      hint: "customer_read_quick_sale",
    });
    expect(msg).toContain("Shopify nekade");
    expect(msg).toContain("Partner Dashboard");
    expect(msg).toContain("customer_read_quick_sale");
  });

  it("normalizes unknown permission codes to scope_not_granted messaging", () => {
    const msg = formatOAuthErrorMessage({
      ...details("invalid_scope"),
      hint: "read_orders",
    });
    expect(msg).toContain("behörigheter");
    expect(msg).toContain("read_orders");
  });
});
