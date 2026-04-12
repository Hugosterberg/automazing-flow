import { describe, expect, it } from "vitest";
import { DEFAULT_OAUTH_ERROR_MESSAGES, formatOAuthErrorMessage, type OAuthErrorDetails } from "./oauthErrors";

function details(code: string): OAuthErrorDetails {
  return { code, statusCode: null, exception: null, hint: null };
}

describe("formatOAuthErrorMessage", () => {
  it("uses built-in copy for not_authenticated", () => {
    const msg = formatOAuthErrorMessage(details("not_authenticated"));
    expect(msg).toContain("server session");
    expect(DEFAULT_OAUTH_ERROR_MESSAGES.not_authenticated).toBe(msg);
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
});
