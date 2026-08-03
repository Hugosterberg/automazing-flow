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
import { fetchZernioAccountEnrichment } from "../providers/zernioEnrichment.ts";
import { buildGoogleBusinessPanelFromZernioExtra } from "../providers/googleBusinessProfile.ts";
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

const GOOGLE_LOCATION_READ_MASK = [
  "name",
  "title",
  "websiteUri",
  "phoneNumbers",
  "storefrontAddress",
  "categories",
  "metadata",
].join(",");

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return fallback;
}

function pickString(obj: Record<string, any> | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = safeString(obj[key]);
    if (value) return value;
  }
  return undefined;
}

function parseGoogleRating(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const normalized = value.trim().toUpperCase();
    const enumMap: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };
    return enumMap[normalized];
  }
  return undefined;
}

function mapGoogleReview(r: any, i: number, source: "zernio" | "official") {
  const reviewer = asRecord(r?.reviewer);
  const author =
    safeString(r?.authorName) ||
    safeString(r?.author) ||
    pickString(reviewer, ["displayName", "name"]) ||
    "Anonymous";
  return {
    id: safeString(r?.id) || safeString(r?.reviewId) || safeString(r?.name) || String(i),
    author,
    rating: parseGoogleRating(r?.rating ?? r?.starRating),
    text: safeString(r?.comment) || safeString(r?.text) || safeString(r?.content),
    createdAt: safeString(r?.createTime) || safeString(r?.createdAt) || safeString(r?.date),
    url: safeString(r?.url) || safeString(r?.reviewUrl),
    source,
  };
}

function pickPhoneFromLocation(loc: Record<string, any> | null): string | undefined {
  const direct = pickString(loc, ["phone", "primaryPhone", "formattedPhone"]);
  if (direct) return direct;
  const phoneNumbers = asRecord(loc?.phoneNumbers);
  return pickString(phoneNumbers, ["primaryPhone", "phoneNumber"]);
}

function pickAddressLines(loc: Record<string, any> | null): string[] {
  const address = asRecord(loc?.storefrontAddress) ?? asRecord(loc?.address);
  if (!address) {
    const formatted = pickString(loc, ["formattedAddress", "address"]);
    return formatted ? [formatted] : [];
  }
  if (Array.isArray(address.addressLines)) {
    return address.addressLines.map((line: unknown) => safeString(line)).filter(Boolean);
  }
  const formatted = pickString(address, ["formattedAddress"]);
  return formatted ? [formatted] : [];
}

function googleApiErrorMessage(body: any): string {
  const error = asRecord(body?.error);
  const details = Array.isArray(error?.details)
    ? error.details
        .map((detail: unknown) => pickString(asRecord(detail), ["reason", "message", "domain", "type"]))
        .filter(Boolean)
        .join("; ")
    : "";
  return (
    pickString(error, ["message", "status"]) ||
    safeString(body?.error) ||
    pickString(asRecord(body), ["message", "error_description"]) ||
    details
  );
}

function pickCategory(loc: Record<string, any> | null): string | undefined {
  const categories = loc?.categories;
  if (Array.isArray(categories) && categories[0]) {
    const first = asRecord(categories[0]);
    const name = pickString(first, ["displayName", "name"]);
    if (name) return name;
  }
  const primary = asRecord(loc?.primaryCategory ?? loc?.mainCategory);
  return pickString(primary ?? loc, ["displayName", "name", "category"]);
}

function averageFromReviews(reviews: Array<{ rating?: number }>): number | undefined {
  const rated = reviews.filter((r) => typeof r.rating === "number" && r.rating > 0);
  if (rated.length === 0) return undefined;
  return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
}

function googleBusinessPanelFromOfficialLocation(
  locationData: unknown,
  reviews: Array<ReturnType<typeof mapGoogleReview>>,
  totalReviewCount: number,
  aggregateAverage?: number
) {
  const loc = asRecord(locationData);
  const title = pickString(loc, ["title", "name"]);
  return {
    source: "official",
    title,
    phone: pickPhoneFromLocation(loc),
    website: pickString(loc, ["websiteUri", "website"]),
    addressLines: pickAddressLines(loc),
    primaryCategory: pickCategory(loc),
    averageRating: aggregateAverage ?? averageFromReviews(reviews),
    reviewCount: totalReviewCount || reviews.length,
    reviews,
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
    const [reviewsResult, enrichment] = await Promise.all([
      zernio.listReviews(zid, {
        candidates: ["generic", "account_nested", "google_business"],
      }),
      fetchZernioAccountEnrichment(zernio, zid, {
        platform: "google_reviews",
        zernioPlatform: String(stored.zernioPlatform || "google_business"),
      }),
    ]);
    const payload: any = reviewsResult.ok ? reviewsResult.data : null;
    const list =
      payload?.reviews ??
      payload?.data?.reviews ??
      (Array.isArray(payload?.data) ? payload.data : []) ??
      [];
    const panel = buildGoogleBusinessPanelFromZernioExtra(enrichment.zernioExtra);
    const directReviews = Array.isArray(list)
      ? list.slice(0, 40).map((r: any, i: number) => mapGoogleReview(r, i, "zernio"))
      : [];
    const reviews =
      directReviews.length > 0
        ? directReviews
        : (panel?.reviews || []).slice(0, 40).map((r, i) => ({
            ...r,
            id: String(r.id || i),
            source: "zernio",
          }));
    const averageRating = panel?.averageRating ?? averageFromReviews(reviews);
    const reviewCount = panel?.reviewCount ?? reviews.length;
    const infoAvailable =
      Boolean(panel?.title || panel?.phone || panel?.website || panel?.primaryCategory) ||
      Boolean(panel?.addressLines?.length);
    return {
      kind: "json",
      body: {
        profile: {
          name: panel?.title || stored.displayName || stored.username || "Google Reviews",
          location: panel?.addressLines?.join(", ") || "",
        },
        stats: { averageRating, reviewCount },
        reviews,
        ...(panel ? { googleBusiness: { ...panel, reviews } } : {}),
        source: "zernio",
        note:
          reviews.length === 0 && !infoAvailable
            ? "Zernio har inte returnerat några omdömen eller företagsuppgifter för det här kontot ännu."
            : enrichment.zernioEnrichmentNotes.length > 0
              ? enrichment.zernioEnrichmentNotes.join(" ")
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
  const reviewsUrl =
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountIdPath)}/locations/${encodeURIComponent(locationIdPath)}/reviews`;
  const infoUrl =
    `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${encodeURIComponent(accountIdPath)}/locations/${encodeURIComponent(locationIdPath)}?readMask=${encodeURIComponent(GOOGLE_LOCATION_READ_MASK)}`;
  let refreshOauthError: string | null = null;

  async function fetchJson(url: string): Promise<{ res: Response; body: any }> {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && refreshToken && googleClientId && googleClientSecret) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      }
    }
    const body: any = await res.json().catch(() => ({}));
    return { res, body };
  }

  async function refreshAccessToken(): Promise<string | null> {
    try {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: String(refreshToken),
          grant_type: "refresh_token",
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const refreshData: any = await refreshRes.json().catch(() => ({}));
      if (refreshData.access_token) {
        token = refreshData.access_token;
        await tokenStore.set(accountId, { ...stored, accessToken: token });
        return token;
      }
      refreshOauthError = refreshData?.error || `refresh_failed_${refreshRes.status}`;
      return null;
    } catch (error) {
      refreshOauthError = error instanceof Error ? error.message : "refresh_request_failed";
      return null;
    }
  }

  const { res: reviewsRes, body } = await fetchJson(reviewsUrl);
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
    const msg = googleApiErrorMessage(body);
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
  const list = Array.isArray(body.reviews) ? body.reviews : [];
  const reviews = list.slice(0, 50).map((r: any, i: number) => mapGoogleReview(r, i, "official"));
  const totalReviewCount = Number(body.totalReviewCount || reviews.length) || reviews.length;
  const aggregateAverage =
    parseGoogleRating(body.averageRating ?? body.average_rating) ?? averageFromReviews(reviews);
  const { res: infoRes, body: infoBody } = await fetchJson(infoUrl);
  const googleBusiness = infoRes.ok
    ? googleBusinessPanelFromOfficialLocation(infoBody, reviews, totalReviewCount, aggregateAverage)
    : null;
  const locationText = googleBusiness?.addressLines?.join(", ") || String(stored.googleBusinessLocationName || "");
  return {
    kind: "json",
    body: {
      profile: {
        name: googleBusiness?.title || stored.username || "Google Reviews",
        location: locationText,
      },
      stats: {
        averageRating: googleBusiness?.averageRating ?? aggregateAverage,
        reviewCount: googleBusiness?.reviewCount ?? totalReviewCount,
      },
      reviews,
      ...(googleBusiness ? { googleBusiness } : {}),
      source: "official",
      note: !infoRes.ok
        ? "Omdömena lästes in, men företagsuppgifterna kunde inte hämtas från Google Business Information API."
        : undefined,
    },
  };
}
