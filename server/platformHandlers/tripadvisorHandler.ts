/* eslint-disable @typescript-eslint/no-explicit-any --
 * Tripadvisor Content API and Zernio review payloads are loosely typed;
 * casts to `any` are kept local to this handler.
 */

/**
 * Tripadvisor account-data handler.
 *
 * Two flows:
 *   1. Zernio-backed → `zernio.listReviews()` with a candidate path list.
 *   2. Native Content API → `api.content.tripadvisor.com` with API key +
 *      location ID stored on the account (or fallback env vars).
 */

import type { ZernioModule } from "../providers/zernioModule.ts";
import type { PlatformHandlerResult } from "./types.ts";

interface TripadvisorHandlerArgs {
  zernio: ZernioModule;
  stored: Record<string, any>;
  isZernio: boolean;
  zernioAccountId: string | null | undefined;
  getZernioApiKey: () => string;
}

export async function handleTripadvisorAccountData({
  zernio,
  stored,
  isZernio,
  zernioAccountId,
  getZernioApiKey,
}: TripadvisorHandlerArgs): Promise<PlatformHandlerResult> {
  if (isZernio && zernioAccountId && getZernioApiKey()) {
    const zid = String(zernioAccountId);
    const reviewsResult = await zernio.listReviews(zid, {
      candidates: ["generic", "account_nested", "tripadvisor"],
    });
    const payload: any = reviewsResult.ok ? reviewsResult.data : null;
    const list =
      payload?.reviews ??
      payload?.data?.reviews ??
      (Array.isArray(payload?.data) ? payload.data : []) ??
      [];
    const reviews = Array.isArray(list)
      ? list.slice(0, 40).map((r: any, i: number) => ({
          id: String(r.id || r.reviewId || i),
          author: String(r.authorName || r.author || "Anonymous"),
          rating: Number(r.rating ?? r.starRating ?? 0) || undefined,
          text: String(r.comment || r.text || ""),
          createdAt: String(r.date || r.createdAt || ""),
          url: String(r.url || r.reviewUrl || ""),
          source: "zernio",
        }))
      : [];
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length
        : undefined;
    return {
      kind: "json",
      body: {
        profile: { name: stored.displayName || stored.username || "Tripadvisor" },
        stats: { averageRating, reviewCount: reviews.length },
        reviews,
        source: "zernio",
        note:
          reviews.length === 0
            ? "No Tripadvisor review payload returned via Zernio yet."
            : undefined,
      },
    };
  }

  const apiKey = String(stored.tripadvisorApiKey || process.env.TRIPADVISOR_API_KEY || "").trim();
  const locationId = String(
    stored.tripadvisorLocationId || process.env.TRIPADVISOR_LOCATION_ID || ""
  ).trim();
  if (!apiKey || !locationId) {
    return {
      kind: "error",
      status: 400,
      body: {
        error:
          "Tripadvisor official API needs TRIPADVISOR_API_KEY and TRIPADVISOR_LOCATION_ID in .env (or reconnect).",
      },
    };
  }
  const lang = "en";
  const reviewsRes = await fetch(
    `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/reviews?key=${encodeURIComponent(apiKey)}&language=${lang}`,
    { headers: { Accept: "application/json" } }
  );
  if (!reviewsRes.ok) {
    const errBody: any = await reviewsRes.json().catch(() => ({}));
    const taMsg =
      (errBody?.error && typeof errBody.error === "object" && errBody.error?.message) ||
      errBody?.message ||
      (typeof errBody?.error === "string" ? errBody.error : "");
    if (reviewsRes.status === 401 || reviewsRes.status === 403) {
      return {
        kind: "error",
        status: reviewsRes.status,
        body: {
          error:
            taMsg ||
            "Tripadvisor rejected the API key or this location. Check TRIPADVISOR_API_KEY and TRIPADVISOR_LOCATION_ID in Content API (Tripadvisor Developer).",
        },
      };
    }
    return {
      kind: "error",
      status: 502,
      body: {
        error: taMsg
          ? `Tripadvisor Content API: ${taMsg}`
          : "Could not fetch Tripadvisor reviews from official API.",
      },
    };
  }
  const body: any = await reviewsRes.json().catch(() => ({}));
  const list = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.reviews)
      ? body.reviews
      : [];
  const reviews = list.slice(0, 50).map((r: any, i: number) => ({
    id: String(r.id || i),
    author: String(r.user?.username || r.user?.name || r.author || "Anonymous"),
    rating: Number(r.rating || 0) || undefined,
    text: String(r.text || r.title || ""),
    createdAt: String(r.published_date || r.date || ""),
    url: String(r.url || ""),
    source: "official",
  }));
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length
      : undefined;
  return {
    kind: "json",
    body: {
      profile: { name: stored.username || `Tripadvisor location ${locationId}` },
      stats: { averageRating, reviewCount: reviews.length },
      reviews,
      source: "official",
    },
  };
}
