import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchJudgemeReviewCount,
  fetchJudgemeReviews,
  judgemeCredentialsFromStored,
  normalizeJudgemeShopDomain,
  sendJudgemeReviewRequest,
} from "../../server/providers/judgeme.ts";

const CREDS = { shopDomain: "demo.myshopify.com", apiToken: "secret-token" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeJudgemeShopDomain", () => {
  it("normalizes handles and admin URLs to the myshopify domain", () => {
    expect(normalizeJudgemeShopDomain("my-store")).toBe("my-store.myshopify.com");
    expect(normalizeJudgemeShopDomain("https://MyStore.myshopify.com/admin")).toBe("mystore.myshopify.com");
  });

  it("keeps non-Shopify hosts (Judge.me supports other platforms)", () => {
    expect(normalizeJudgemeShopDomain("https://www.example.com/shop")).toBe("example.com");
  });

  it("rejects empty and hostless input", () => {
    expect(normalizeJudgemeShopDomain("")).toBeNull();
    expect(normalizeJudgemeShopDomain("   ")).toBeNull();
  });
});

describe("judgemeCredentialsFromStored", () => {
  it("extracts stored credentials", () => {
    expect(
      judgemeCredentialsFromStored({ judgemeShopDomain: "demo.myshopify.com", judgemeApiToken: "t" })
    ).toEqual({ shopDomain: "demo.myshopify.com", apiToken: "t" });
  });

  it("returns null when either field is missing", () => {
    expect(judgemeCredentialsFromStored({ judgemeShopDomain: "demo.myshopify.com" })).toBeNull();
    expect(judgemeCredentialsFromStored(null)).toBeNull();
  });
});

describe("fetchJudgemeReviews", () => {
  it("authenticates via query params and maps the official review shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          current_page: 1,
          per_page: 50,
          reviews: [
            {
              id: 101,
              title: "Great product",
              body: "Loved it!",
              rating: 5,
              created_at: "2026-07-01T10:00:00Z",
              verified: "buyer",
              hidden: false,
              reviewer: { name: "Anna" },
              pictures: [
                { urls: { small: "https://cdn.judge.me/p1-small.jpg", huge: "https://cdn.judge.me/p1-huge.jpg" } },
              ],
              product_external_id: "555",
            },
          ],
        }),
        { status: 200 }
      )
    );

    const result = await fetchJudgemeReviews(CREDS, { perPage: 50 });
    expect(result.ok).toBe(true);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews?.[0]).toMatchObject({
      id: "101",
      author: "Anna",
      rating: 5,
      title: "Great product",
      text: "Loved it!",
      verified: true,
      pictures: [{ thumb: "https://cdn.judge.me/p1-small.jpg", full: "https://cdn.judge.me/p1-huge.jpg" }],
      productExternalId: "555",
      source: "judgeme",
    });

    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe("https://judge.me/api/v1/reviews");
    expect(calledUrl.searchParams.get("shop_domain")).toBe("demo.myshopify.com");
    expect(calledUrl.searchParams.get("api_token")).toBe("secret-token");
    expect(calledUrl.searchParams.get("per_page")).toBe("50");
  });

  it("surfaces auth failures with a helpful message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );
    const result = await fetchJudgemeReviews(CREDS);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/credentials/i);
  });
});

describe("fetchJudgemeReviews ordering and resilience", () => {
  function reviewPayload(rows: Array<{ id: number; created_at?: string }>) {
    return new Response(
      JSON.stringify({
        reviews: rows.map((row) => ({ ...row, body: `body ${row.id}`, rating: 5, reviewer: { name: "X" } })),
      }),
      { status: 200 }
    );
  }

  it("sorts newest first regardless of the order the API returns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reviewPayload([
        { id: 1, created_at: "2026-01-01T00:00:00Z" },
        { id: 3, created_at: "2026-06-01T00:00:00Z" },
        { id: 2, created_at: "2026-03-01T00:00:00Z" },
      ])
    );
    const result = await fetchJudgemeReviews(CREDS);
    expect(result.reviews?.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("keeps undated reviews last instead of floating them to the top", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reviewPayload([{ id: 1 }, { id: 2, created_at: "2026-03-01T00:00:00Z" }])
    );
    const result = await fetchJudgemeReviews(CREDS);
    expect(result.reviews?.map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("retries once when Judge.me rate-limits the request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(reviewPayload([{ id: 7, created_at: "2026-05-01T00:00:00Z" }]));
    const result = await fetchJudgemeReviews(CREDS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.reviews?.[0].id).toBe("7");
  });
});

describe("fetchJudgemeReviewCount", () => {
  it("returns the published total from /reviews/count", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ count: 321 }), { status: 200 })
    );
    await expect(fetchJudgemeReviewCount(CREDS)).resolves.toBe(321);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/reviews/count");
  });

  it("degrades to null on errors instead of failing the page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    await expect(fetchJudgemeReviewCount(CREDS)).resolves.toBeNull();
  });
});

describe("sendJudgemeReviewRequest", () => {
  it("posts order id, email and platform to the review-request endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const result = await sendJudgemeReviewRequest(CREDS, {
      orderId: "9001",
      email: "customer@example.com",
      name: "Anna",
    });
    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/orders/send_manual_review_request");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      id: "9001",
      email: "customer@example.com",
      name: "Anna",
      platform: "shopify",
    });
  });
});
