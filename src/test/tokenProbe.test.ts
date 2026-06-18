import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isProbeablePlatform, probeOAuthConnection } from "../../server/lib/tokenProbe.ts";

describe("isProbeablePlatform", () => {
  it("recognises Google + Microsoft platforms", () => {
    expect(isProbeablePlatform("gmail")).toBe(true);
    expect(isProbeablePlatform("google_ads")).toBe(true);
    expect(isProbeablePlatform("outlook")).toBe(true);
    expect(isProbeablePlatform("outlook_calendar")).toBe(true);
  });

  it("leaves non-refreshable / non-OAuth platforms alone", () => {
    expect(isProbeablePlatform("shopify")).toBe(false);
    expect(isProbeablePlatform("notion")).toBe(false);
    expect(isProbeablePlatform("instagram")).toBe(false);
    expect(isProbeablePlatform("")).toBe(false);
  });
});

describe("probeOAuthConnection", () => {
  const realFetch = global.fetch;
  const realId = process.env.GOOGLE_CLIENT_ID;
  const realSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env.GOOGLE_CLIENT_ID = realId;
    process.env.GOOGLE_CLIENT_SECRET = realSecret;
    vi.restoreAllMocks();
  });

  function mockFetch(status: number, body: unknown) {
    global.fetch = vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })) as unknown as typeof fetch;
  }

  it("reports healthy and persists the refreshed token on success", async () => {
    mockFetch(200, { access_token: "fresh" });
    const set = vi.fn(async () => undefined);
    const result = await probeOAuthConnection({
      accountId: "gmail_1",
      stored: { platform: "gmail", refreshToken: "rt", accessToken: "old" },
      tokenStore: { set },
    });
    expect(result).toEqual({ status: "healthy" });
    expect(set).toHaveBeenCalledWith("gmail_1", expect.objectContaining({ accessToken: "fresh" }));
  });

  it("reports expired only on an explicit invalid_grant", async () => {
    mockFetch(400, { error: "invalid_grant" });
    const result = await probeOAuthConnection({
      accountId: "gmail_1",
      stored: { platform: "gmail", refreshToken: "rt" },
      tokenStore: { set: vi.fn(async () => undefined) },
    });
    expect(result.status).toBe("expired");
  });

  it("stays unknown on a transient provider error (never a false reconnect)", async () => {
    mockFetch(429, { error: "rate_limited" });
    const result = await probeOAuthConnection({
      accountId: "gmail_1",
      stored: { platform: "gmail", refreshToken: "rt" },
      tokenStore: { set: vi.fn(async () => undefined) },
    });
    expect(result.status).toBe("unknown");
  });

  it("stays unknown when there is no refresh token to verify with", async () => {
    const set = vi.fn(async () => undefined);
    const result = await probeOAuthConnection({
      accountId: "gmail_1",
      stored: { platform: "gmail" },
      tokenStore: { set },
    });
    expect(result.status).toBe("unknown");
    expect(set).not.toHaveBeenCalled();
  });

  it("does not probe unsupported platforms", async () => {
    const set = vi.fn(async () => undefined);
    const result = await probeOAuthConnection({
      accountId: "shop_1",
      stored: { platform: "shopify", refreshToken: "rt" },
      tokenStore: { set },
    });
    expect(result.status).toBe("unknown");
    expect(set).not.toHaveBeenCalled();
  });
});
