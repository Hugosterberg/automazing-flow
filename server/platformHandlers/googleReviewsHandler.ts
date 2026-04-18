/* eslint-disable @typescript-eslint/no-explicit-any --
 * Google My Business (v4) and Zernio review payloads are loosely typed;
 * casts to `any` are kept local to this handler.
 */

/**
 * Google Reviews account-data handler.
 *
 * Two flows:
 *   1. Zernio-backed → `zernio.listReviews()` with a candidate path list.
 *   2. Native OAuth → `mybusiness.googleapis.com` with token refresh fallback.
 *
 * The native flow is careful about 401 handling: it tries a refresh token
 * once, then surfaces different error messages depending on whether refresh
 * is configured, available, or revoked.
 */

import type { ZernioModule } from "../providers/zernioModule.ts";
import type { PlatformHandlerResult } from "./types.ts";

interface GoogleReviewsHandlerArgs {
  zernio: ZernioModule;
  stored: Record<string, any>;
  accountId: string;
  accessToken: string | null | undefined;
  isZernio: boolean;
  zernioAccountId: string | null | undefined;
  getZernioApiKey: () => string;
  tokenStore: {
    set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  };
}

export async function handleGoogleReviewsAccountData({
  zernio,
  stored,
  accountId,
  accessToken,
  isZernio,
  zernioAccountId,
  getZernioApiKey,
  tokenStore,
}: GoogleReviewsHandlerArgs): Promise<PlatformHandlerResult> {
  if (isZernio && zernioAccountId && getZernioApiKey()) {
    const zid = String(zernioAccountId);
    const reviewsResult = await zernio.listReviews(zid, {
      candidates: ["generic", "account_nested", "google_business"],
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
          author: String(r.authorName || r.author || r.reviewer || "Anonymous"),
          rating: Number(r.rating ?? r.starRating ?? 0) || undefined,
          text: String(r.comment || r.text || r.content || ""),
          createdAt: String(r.createTime || r.createdAt || r.date || ""),
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
        profile: { name: stored.displayName || stored.username || "Google Reviews" },
        stats: { averageRating, reviewCount: reviews.length },
        reviews,
        source: "zernio",
        note:
          reviews.length === 0
            ? "No review payload returned via Zernio for this account yet."
            : undefined,
      },
    };
  }

  const refreshToken = stored.refreshToken;
  let token: any = accessToken;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const accountIdPath = String(stored.googleBusinessAccountId || "").trim();
  const locationIdPath = String(stored.googleBusinessLocationId || "").trim();
  if (!accountIdPath || !locationIdPath) {
    return {
      kind: "error",
      status: 400,
      body: { error: "Google Reviews location is missing. Reconnect the account." },
    };
  }
  const makeUrl = () =>
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountIdPath)}/locations/${encodeURIComponent(locationIdPath)}/reviews`;
  let reviewsRes = await fetch(makeUrl(), { headers: { Authorization: `Bearer ${token}` } });
  let refreshOauthError: string | null = null;
  if (reviewsRes.status === 401 && refreshToken && googleClientId && googleClientSecret) {
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: String(refreshToken),
        grant_type: "refresh_token",
      }).toString(),
    });
    const refreshData: any = await refreshRes.json().catch(() => ({}));
    if (refreshData.access_token) {
      token = refreshData.access_token;
      await tokenStore.set(accountId, { ...stored, accessToken: token });
      reviewsRes = await fetch(makeUrl(), { headers: { Authorization: `Bearer ${token}` } });
    } else {
      refreshOauthError = refreshData?.error || null;
    }
  }
  if (!reviewsRes.ok) {
    if (!googleClientId || !googleClientSecret) {
      return {
        kind: "error",
        status: 503,
        body: {
          error:
            "Google OAuth client is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET so review tokens can be refreshed.",
        },
      };
    }
    if (reviewsRes.status === 401) {
      if (refreshOauthError === "invalid_grant") {
        return {
          kind: "error",
          status: 401,
          body: {
            error:
              "Google revoked or expired this Business Profile connection. Reconnect Google Reviews in Accounts.",
          },
        };
      }
      if (!refreshToken) {
        return {
          kind: "error",
          status: 401,
          body: {
            error:
              "Google access expired and no refresh token is stored. Reconnect Google Reviews (include offline access).",
          },
        };
      }
      return {
        kind: "error",
        status: 401,
        body: {
          error: "Google access token is not valid for reviews. Reconnect Google Reviews in Accounts.",
        },
      };
    }
    const errBody: any = await reviewsRes.json().catch(() => ({}));
    const msg =
      errBody?.error?.message ||
      errBody?.error?.details ||
      (typeof errBody?.error === "string" ? errBody.error : "");
    return {
      kind: "error",
      status: 502,
      body: {
        error: msg
          ? `Could not fetch Google reviews: ${msg}`
          : "Could not fetch Google reviews from official API.",
      },
    };
  }
  const body: any = await reviewsRes.json().catch(() => ({}));
  const list = Array.isArray(body.reviews) ? body.reviews : [];
  const reviews = list.slice(0, 50).map((r: any, i: number) => ({
    id: String(r.reviewId || r.name || i),
    author: String(r.reviewer?.displayName || "Anonymous"),
    rating: Number(r.starRating || 0) || undefined,
    text: String(r.comment || ""),
    createdAt: String(r.createTime || ""),
    url: "",
    source: "official",
  }));
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length
      : undefined;
  return {
    kind: "json",
    body: {
      profile: {
        name: stored.username || "Google Reviews",
        location: stored.googleBusinessLocationName || "",
      },
      stats: {
        averageRating,
        reviewCount: Number(body.totalReviewCount || reviews.length) || reviews.length,
      },
      reviews,
      source: "official",
    },
  };
}
