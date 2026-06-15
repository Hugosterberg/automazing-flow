import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchMetaActiveCampaigns } from "../../server/providers/metaAds";
import { fetchGoogleAdsActiveCampaigns } from "../../server/providers/googleAds";

// jsdom (the vitest env) doesn't implement AbortSignal.timeout, which the
// providers use. Polyfill it so the fetch path is exercised.
beforeAll(() => {
  if (typeof AbortSignal.timeout !== "function") {
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => {
      const c = new AbortController();
      setTimeout(() => c.abort(), ms);
      return c.signal;
    };
  }
});

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as unknown as Response;
}

describe("fetchMetaActiveCampaigns", () => {
  const stored = {
    accessToken: "tok",
    username: "Acme",
    metaAdAccountId: "act_123",
    metaAdAccounts: [{ id: "act_123", name: "Acme Ads", currency: "SEK" }],
  };

  it("notes when no ad account is linked", async () => {
    const result = await fetchMetaActiveCampaigns({ accessToken: "tok" }, "v20.0");
    expect(result.campaigns).toHaveLength(0);
    expect(result.note).toMatch(/no ad account/i);
  });

  it("returns active campaigns with converted budget and merged 7-day spend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes("/campaigns")) {
          return jsonResponse({
            data: [{ id: "1", name: "Summer Sale", status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: "5000" }],
          });
        }
        if (u.includes("/insights")) {
          return jsonResponse({ data: [{ campaign_id: "1", spend: "123.45", impressions: "1000", clicks: "20" }] });
        }
        return jsonResponse({});
      }),
    );
    const result = await fetchMetaActiveCampaigns(stored, "v20.0");
    expect(result.currency).toBe("SEK");
    expect(result.campaigns).toHaveLength(1);
    const c = result.campaigns[0];
    expect(c.name).toBe("Summer Sale");
    expect(c.dailyBudget).toBe(50); // 5000 minor units → 50.00
    expect(c.spend7d).toBeCloseTo(123.45);
    expect(c.clicks7d).toBe(20);
  });

  it("surfaces a reconnect note on an expired-token error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: 190, message: "Session expired" } })),
    );
    const result = await fetchMetaActiveCampaigns(stored, "v20.0");
    expect(result.campaigns).toHaveLength(0);
    expect(result.note).toMatch(/reconnect/i);
  });
});

describe("fetchGoogleAdsActiveCampaigns", () => {
  it("degrades gracefully when no developer token is configured", async () => {
    const result = await fetchGoogleAdsActiveCampaigns({ refreshToken: "rt" }, {});
    expect(result.platform).toBe("google_ads");
    expect(result.campaigns).toHaveLength(0);
    expect(result.note).toMatch(/developer token/i);
  });
});
