import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthHelpers, AUTH_SESSION_COOKIE } from "../../server/lib/authHelpers.ts";

const realSecret = process.env.AUTH_SESSION_SECRET;

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = "test-signing-secret";
});

afterEach(() => {
  process.env.AUTH_SESSION_SECRET = realSecret;
  vi.useRealTimers();
});

function makeAuth(overrides: Partial<{ baseUrl: string; supabaseUrl: string; supabaseAnonKey: string }> = {}) {
  return createAuthHelpers({
    baseUrl: "https://automazing.life",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
    ...overrides,
  });
}

describe("parseCookies", () => {
  it("parses multiple cookies and url-decodes values", () => {
    const auth = makeAuth();
    const cookies = auth.parseCookies("a=1; b=hello%20world; c=");
    expect(cookies).toEqual({ a: "1", b: "hello world", c: "" });
  });

  it("returns an empty object for a missing header", () => {
    const auth = makeAuth();
    expect(auth.parseCookies()).toEqual({});
    expect(auth.parseCookies("")).toEqual({});
  });
});

describe("signAuthSessionCookie / verifyAuthSessionCookie", () => {
  it("round-trips the user id", () => {
    const auth = makeAuth();
    const cookie = auth.signAuthSessionCookie("user-123");
    expect(auth.verifyAuthSessionCookie(cookie)).toBe("user-123");
  });

  it("rejects a tampered payload", () => {
    const auth = makeAuth();
    const cookie = auth.signAuthSessionCookie("user-123");
    const [payload, sig] = cookie.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ u: "attacker", exp: Date.now() + 999999 }), "utf8").toString(
      "base64url"
    );
    expect(auth.verifyAuthSessionCookie(`${tamperedPayload}.${sig}`)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const auth = makeAuth();
    const cookie = auth.signAuthSessionCookie("user-123");
    process.env.AUTH_SESSION_SECRET = "a-completely-different-secret";
    expect(auth.verifyAuthSessionCookie(cookie)).toBeNull();
  });

  it("rejects malformed input", () => {
    const auth = makeAuth();
    expect(auth.verifyAuthSessionCookie("")).toBeNull();
    expect(auth.verifyAuthSessionCookie("no-dot-here")).toBeNull();
    expect(auth.verifyAuthSessionCookie(".onlysig")).toBeNull();
    expect(auth.verifyAuthSessionCookie("onlypayload.")).toBeNull();
  });

  it("rejects an expired session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const auth = makeAuth();
    const cookie = auth.signAuthSessionCookie("user-123");
    expect(auth.verifyAuthSessionCookie(cookie)).toBe("user-123");

    vi.setSystemTime(new Date("2026-01-09T00:00:00Z")); // past the 7-day TTL
    expect(auth.verifyAuthSessionCookie(cookie)).toBeNull();
  });
});

describe("getSessionUserId", () => {
  it("resolves the user id from the session cookie in the request", () => {
    const auth = makeAuth();
    const cookie = auth.signAuthSessionCookie("user-123");
    const userId = auth.getSessionUserId({
      headers: { cookie: `${AUTH_SESSION_COOKIE}=${encodeURIComponent(cookie)}; other=1` },
    });
    expect(userId).toBe("user-123");
  });

  it("returns null when the session cookie is missing", () => {
    const auth = makeAuth();
    expect(auth.getSessionUserId({ headers: {} })).toBeNull();
    expect(auth.getSessionUserId({ headers: { cookie: "other=1" } })).toBeNull();
  });
});

describe("getStoredAccountAccess", () => {
  const auth = makeAuth();

  it("allows access to an unowned (legacy) account and flags it for migration", () => {
    expect(auth.getStoredAccountAccess({}, "user-a")).toEqual({
      allowed: true,
      migrate: true,
      reason: "unowned",
    });
  });

  it("allows the owner and does not require migration", () => {
    expect(auth.getStoredAccountAccess({ ownerUserId: "user-a" }, "user-a")).toEqual({
      allowed: true,
      migrate: false,
      reason: "owner_match",
    });
  });

  it("allows a local<->local pair (both local_ prefixed ids)", () => {
    expect(auth.getStoredAccountAccess({ ownerUserId: "local_abc" }, "local_xyz")).toEqual({
      allowed: true,
      migrate: true,
      reason: "local_pair",
    });
  });

  it("bridges a local-owned Google/OAuth account to the first cloud login", () => {
    expect(
      auth.getStoredAccountAccess({ ownerUserId: "local_abc", platform: "gmail" }, "cloud-user-1")
    ).toEqual({ allowed: true, migrate: true, reason: "local_to_cloud_google" });
  });

  it("bridges a cloud-owned Google/OAuth account back to local dev", () => {
    expect(
      auth.getStoredAccountAccess({ ownerUserId: "cloud-user-1", platform: "shopify" }, "local_abc")
    ).toEqual({ allowed: true, migrate: true, reason: "cloud_to_local_google" });
  });

  it("does not bridge non-whitelisted platforms across local/cloud", () => {
    expect(
      auth.getStoredAccountAccess({ ownerUserId: "local_abc", platform: "tiktok" }, "cloud-user-1")
    ).toEqual({ allowed: false, migrate: false, reason: "owner_mismatch" });
  });

  it("denies a genuine owner mismatch between two real accounts", () => {
    expect(
      auth.getStoredAccountAccess({ ownerUserId: "user-a", platform: "gmail" }, "user-b")
    ).toEqual({ allowed: false, migrate: false, reason: "owner_mismatch" });
  });
});

describe("verifySupabaseAccessToken", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(ok: boolean, body: unknown) {
    global.fetch = vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
  }

  it("returns the user id/email on a valid token", async () => {
    mockFetch(true, { id: "user-123", email: "a@b.com" });
    const auth = makeAuth();
    await expect(auth.verifySupabaseAccessToken("valid-token")).resolves.toEqual({
      id: "user-123",
      email: "a@b.com",
    });
  });

  it("returns null on a non-ok response", async () => {
    mockFetch(false, {});
    const auth = makeAuth();
    await expect(auth.verifySupabaseAccessToken("bad-token")).resolves.toBeNull();
  });

  it("returns null without calling fetch when supabase config or token is missing", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const authNoUrl = makeAuth({ supabaseUrl: "" });
    await expect(authNoUrl.verifySupabaseAccessToken("token")).resolves.toBeNull();

    const auth = makeAuth();
    await expect(auth.verifySupabaseAccessToken("")).resolves.toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("setAuthCookie / clearAuthCookie", () => {
  it("marks the cookie Secure for an https baseUrl", () => {
    const auth = makeAuth({ baseUrl: "https://automazing.life" });
    const setHeader = vi.fn();
    auth.setAuthCookie({ setHeader }, "cookie-value");
    const [, value] = setHeader.mock.calls[0];
    expect(value).toContain("Secure");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
  });

  it("omits Secure for an http (local dev) baseUrl", () => {
    const auth = makeAuth({ baseUrl: "http://localhost:8080" });
    const setHeader = vi.fn();
    auth.setAuthCookie({ setHeader }, "cookie-value");
    const [, value] = setHeader.mock.calls[0];
    expect(value).not.toContain("Secure");
  });

  it("clears the cookie with Max-Age=0", () => {
    const auth = makeAuth();
    const setHeader = vi.fn();
    auth.clearAuthCookie({ setHeader });
    const [, value] = setHeader.mock.calls[0];
    expect(value).toContain("Max-Age=0");
  });
});

describe("normalizeStoredAccount", () => {
  it("migrates legacy isLate/lateAccountId fields", () => {
    const auth = makeAuth();
    const normalized = auth.normalizeStoredAccount({ isLate: true, lateAccountId: "late-1" });
    expect(normalized).toEqual({
      isLate: true,
      lateAccountId: "late-1",
      instagramViaZernio: true,
      zernioAccountId: "late-1",
    });
  });

  it("leaves already-migrated accounts untouched", () => {
    const auth = makeAuth();
    const input = { instagramViaZernio: true, zernioAccountId: "z-1" };
    expect(auth.normalizeStoredAccount(input)).toEqual(input);
  });

  it("passes through null/non-object input unchanged", () => {
    const auth = makeAuth();
    expect(auth.normalizeStoredAccount(null)).toBeNull();
    expect(auth.normalizeStoredAccount(undefined)).toBeUndefined();
  });
});
