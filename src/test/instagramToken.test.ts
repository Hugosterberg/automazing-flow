import { describe, expect, it } from "vitest";
import {
  isInstagramAuthError,
  shouldRefreshInstagramToken,
} from "../../server/providers/instagram.ts";

describe("instagram token lifecycle", () => {
  const now = Date.parse("2026-06-15T00:00:00Z");

  it("refreshes when the token expires within the 10-day window", () => {
    const expiresAt = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldRefreshInstagramToken(expiresAt, now)).toBe(true);
  });

  it("does not refresh a token with plenty of life left", () => {
    const expiresAt = new Date(now + 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldRefreshInstagramToken(expiresAt, now)).toBe(false);
  });

  it("treats an already-expired token as refresh-eligible", () => {
    const expiresAt = new Date(now - 1000).toISOString();
    expect(shouldRefreshInstagramToken(expiresAt, now)).toBe(true);
  });

  it("never refreshes when no expiry is stored (legacy connections)", () => {
    expect(shouldRefreshInstagramToken(undefined, now)).toBe(false);
    expect(shouldRefreshInstagramToken(null, now)).toBe(false);
    expect(shouldRefreshInstagramToken("not-a-date", now)).toBe(false);
  });

  it("detects Instagram OAuth/expiry errors", () => {
    expect(isInstagramAuthError({ type: "OAuthException", code: 190 })).toBe(true);
    expect(isInstagramAuthError({ code: 190 })).toBe(true);
    expect(isInstagramAuthError({ type: "OAuthException" })).toBe(true);
    expect(isInstagramAuthError({ code: 4, message: "rate limited" })).toBe(false);
    expect(isInstagramAuthError(undefined)).toBe(false);
  });
});
