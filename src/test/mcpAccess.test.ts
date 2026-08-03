import { describe, expect, it } from "vitest";
import {
  isMcpPlatform,
  findMcpAccountForProfile,
  freshOauthAccessTokenForStored,
  pickTool,
  type StoredMcpAccount,
} from "../../server/lib/mcpAccess.ts";

function makeStore(rows: Array<[string, Record<string, unknown>]>) {
  return { entries: async () => rows, get: async () => null, set: async () => undefined };
}

describe("isMcpPlatform", () => {
  it("recognises keyed and OAuth MCP platforms", () => {
    expect(isMcpPlatform("exa")).toBe(true);
    expect(isMcpPlatform("dayai")).toBe(true);
  });

  it("rejects unknown or non-MCP platforms", () => {
    expect(isMcpPlatform("gmail")).toBe(false);
    expect(isMcpPlatform("")).toBe(false);
  });
});

describe("findMcpAccountForProfile", () => {
  it("returns the first connected account matching a preferred platform", async () => {
    const store = makeStore([
      ["acc-1", { platform: "lunarcrush", profileId: "bp-1" }],
      ["acc-2", { platform: "exa", profileId: "bp-1" }],
    ]);
    const result = await findMcpAccountForProfile({
      tokenStore: store,
      businessProfileId: "bp-1",
      platforms: ["exa", "lunarcrush"],
    });
    expect(result).toEqual({ platform: "exa", profileId: "bp-1", __accountId: "acc-2" });
  });

  it("respects platform preference order over storage order", async () => {
    const store = makeStore([
      ["acc-1", { platform: "exa", profileId: "bp-1" }],
      ["acc-2", { platform: "lunarcrush", profileId: "bp-1" }],
    ]);
    const result = await findMcpAccountForProfile({
      tokenStore: store,
      businessProfileId: "bp-1",
      platforms: ["lunarcrush", "exa"],
    });
    expect(result?.__accountId).toBe("acc-2");
  });

  it("never returns an account scoped to a different business profile", async () => {
    const store = makeStore([["acc-1", { platform: "exa", profileId: "bp-other" }]]);
    const result = await findMcpAccountForProfile({
      tokenStore: store,
      businessProfileId: "bp-1",
      platforms: ["exa"],
    });
    expect(result).toBeNull();
  });

  it("ignores non-MCP platform rows and rows with no matching platform", async () => {
    const store = makeStore([
      ["acc-1", { platform: "gmail", profileId: "bp-1" }],
      ["acc-2", { platform: "tiktok", profileId: "bp-1" }],
    ]);
    const result = await findMcpAccountForProfile({
      tokenStore: store,
      businessProfileId: "bp-1",
      platforms: ["exa"],
    });
    expect(result).toBeNull();
  });
});

describe("freshOauthAccessTokenForStored", () => {
  it("rejects a stored account whose platform isn't an OAuth MCP platform", async () => {
    const store = makeStore([]);
    const stored = { __accountId: "acc-1", platform: "exa" } as StoredMcpAccount;
    const result = await freshOauthAccessTokenForStored(store, stored);
    expect(result).toEqual({ ok: false, status: 400, message: "Not an OAuth MCP account." });
  });

  it("reuses a still-valid access token without refreshing", async () => {
    const store = makeStore([]);
    const stored = {
      __accountId: "acc-1",
      platform: "dayai",
      accessToken: "still-good",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h out
    } as StoredMcpAccount;
    const result = await freshOauthAccessTokenForStored(store, stored);
    expect(result).toEqual({ ok: true, accessToken: "still-good" });
  });

  it("rejects an expired token with no refresh token to fall back on", async () => {
    const store = makeStore([]);
    const stored = {
      __accountId: "acc-1",
      platform: "dayai",
      accessToken: "stale",
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // already expired
    } as StoredMcpAccount;
    const result = await freshOauthAccessTokenForStored(store, stored);
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Access token expired; reconnect the account.",
    });
  });
});

describe("pickTool", () => {
  const tools = [
    { name: "get_topic", description: "" },
    { name: "search_web", description: "" },
    { name: "company_lookup", description: "" },
  ];

  it("returns the first tool matching the first pattern that has a hit", () => {
    const tool = pickTool(tools, [/^get_/i, /search/i]);
    expect(tool?.name).toBe("get_topic");
  });

  it("falls through to a later pattern when earlier ones miss", () => {
    const tool = pickTool(tools, [/^nonexistent/i, /^company/i]);
    expect(tool?.name).toBe("company_lookup");
  });

  it("returns null when nothing matches any pattern", () => {
    expect(pickTool(tools, [/^zzz/i])).toBeNull();
  });
});
