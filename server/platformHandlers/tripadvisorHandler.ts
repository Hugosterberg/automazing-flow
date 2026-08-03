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

type TripadvisorSource = "zernio" | "official";

type TripadvisorPhoto = {
  id: string;
  caption?: string;
  url: string;
};

type TripadvisorInfo = {
  source: TripadvisorSource;
  locationId?: string;
  name?: string;
  location?: string;
  address?: string;
  phone?: string;
  website?: string;
  ranking?: string;
  rating?: number;
  reviewCount?: number;
  url?: string;
  photos?: TripadvisorPhoto[];
  reviews: Array<ReturnType<typeof mapTripadvisorReview>>;
};

const TRIPADVISOR_DETAILS_CACHE_TTL_MS = 1000 * 60 * 60;
const tripadvisorDetailsCache = new Map<string, { expiresAt: number; data: unknown }>();
const tripadvisorPhotosCache = new Map<string, { expiresAt: number; photos: TripadvisorPhoto[] }>();

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

function pickNumber(obj: Record<string, any> | null, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    const num =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : NaN;
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

function extractReviewList(raw: unknown): unknown[] {
  const root = asRecord(raw);
  if (!root) return Array.isArray(raw) ? raw : [];
  const data = root.data;
  const nested = asRecord(data);
  const candidates = [
    root.reviews,
    nested?.reviews,
    root.items,
    nested?.items,
    Array.isArray(data) ? data : null,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function mapTripadvisorReview(r: any, i: number, source: TripadvisorSource) {
  const user = asRecord(r?.user);
  const title = safeString(r?.title);
  const text = safeString(r?.text) || safeString(r?.comment) || safeString(r?.content);
  return {
    id: safeString(r?.id) || safeString(r?.reviewId) || String(i),
    author: pickString(user, ["username", "name"]) || safeString(r?.authorName) || safeString(r?.author) || "Anonymous",
    rating: pickNumber(r, ["rating", "starRating"]),
    text: text || title,
    createdAt: safeString(r?.published_date) || safeString(r?.date) || safeString(r?.createdAt),
    url: safeString(r?.url) || safeString(r?.reviewUrl),
    source,
  };
}

function averageFromReviews(reviews: Array<{ rating?: number }>): number | undefined {
  const rated = reviews.filter((r) => typeof r.rating === "number" && r.rating > 0);
  if (rated.length === 0) return undefined;
  return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
}

function addressFromTripadvisor(raw: Record<string, any> | null): string | undefined {
  const addressObj = asRecord(raw?.address_obj);
  if (addressObj) {
    const direct = pickString(addressObj, ["address_string"]);
    if (direct) return direct;
    const parts = [
      pickString(addressObj, ["street1"]),
      pickString(addressObj, ["street2"]),
      pickString(addressObj, ["city"]),
      pickString(addressObj, ["state"]),
      pickString(addressObj, ["postalcode"]),
      pickString(addressObj, ["country"]),
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }
  return pickString(raw, ["address", "addressString", "location_string"]);
}

function tripadvisorInfoFromPayload(
  raw: unknown,
  source: TripadvisorSource,
  locationId?: string,
  reviews: Array<ReturnType<typeof mapTripadvisorReview>> = []
): TripadvisorInfo | null {
  const root = asRecord(raw);
  if (!root) return null;
  const candidates = [
    root,
    asRecord(root.data),
    asRecord(root.location),
    asRecord(root.details),
    asRecord(root.account),
  ].filter(Boolean) as Record<string, any>[];
  const infoRoot =
    candidates.find((candidate) =>
      Boolean(
        pickString(candidate, ["name", "displayName", "locationName"]) ||
          pickString(candidate, ["location_string", "address", "addressString"]) ||
          pickNumber(candidate, ["rating", "reviewCount", "num_reviews"])
      )
    ) ?? root;
  const rankingData = asRecord(infoRoot.ranking_data);
  const name = pickString(infoRoot, ["name", "displayName", "locationName"]);
  const address = addressFromTripadvisor(infoRoot);
  const location = pickString(infoRoot, ["location_string", "location", "city"]) || address;
  const rating = pickNumber(infoRoot, ["rating", "averageRating"]) ?? averageFromReviews(reviews);
  const reviewCount = pickNumber(infoRoot, ["num_reviews", "reviewCount", "reviewsCount", "totalReviewCount"]);
  const info: TripadvisorInfo = {
    source,
    locationId,
    name,
    location,
    address,
    phone: pickString(infoRoot, ["phone"]),
    website: pickString(infoRoot, ["website", "web_url"]),
    ranking: pickString(rankingData, ["ranking_string", "ranking"]) ?? pickString(infoRoot, ["ranking", "rankingString"]),
    rating,
    reviewCount,
    url: pickString(infoRoot, ["web_url", "url"]),
    reviews,
  };
  const hasInfo = Boolean(
    info.name ||
      info.location ||
      info.address ||
      info.phone ||
      info.website ||
      info.ranking ||
      info.rating != null ||
      info.reviewCount != null ||
      info.url
  );
  return hasInfo ? info : null;
}

async function fetchZernioTripadvisorInfo(
  zernio: ZernioModule,
  zernioAccountId: string,
  reviews: Array<ReturnType<typeof mapTripadvisorReview>>
): Promise<TripadvisorInfo | null> {
  const enc = encodeURIComponent(zernioAccountId);
  const candidates = [
    `/accounts/${enc}/tripadvisor/location-details`,
    `/tripadvisor/location-details?accountId=${enc}`,
    `/accounts/${enc}`,
  ];
  for (const path of candidates) {
    const result = await zernio.get(path);
    if (!result.ok) continue;
    const info = tripadvisorInfoFromPayload(result.data, "zernio", zernioAccountId, reviews);
    if (info) return info;
  }
  return null;
}

async function fetchTripadvisorDetails(apiKey: string, locationId: string, language: string) {
  const cacheKey = `${locationId}:${language}`;
  const cached = tripadvisorDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { res: new Response(null, { status: 200 }), body: cached.data, fromCache: true };
  }
  const res = await fetch(
    `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/details?key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}`,
    { headers: { Accept: "application/json" } }
  );
  const body: any = await res.json().catch(() => ({}));
  if (res.ok) {
    tripadvisorDetailsCache.set(cacheKey, {
      expiresAt: Date.now() + TRIPADVISOR_DETAILS_CACHE_TTL_MS,
      data: body,
    });
  }
  return { res, body, fromCache: false };
}

/**
 * Location photos from the official Content API
 * (`GET /location/{id}/photos`). Best-effort with the same 1h cache policy
 * as details — photo sets change rarely and the endpoint counts against the
 * key's monthly quota.
 */
async function fetchTripadvisorPhotos(
  apiKey: string,
  locationId: string,
  language: string
): Promise<TripadvisorPhoto[]> {
  const cacheKey = `${locationId}:${language}`;
  const cached = tripadvisorPhotosCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.photos;
  try {
    const res = await fetch(
      `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/photos?key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];
    const body: any = await res.json().catch(() => ({}));
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    const photos = rows
      .slice(0, 12)
      .map((row): TripadvisorPhoto | null => {
        const images = asRecord(row?.images);
        const sized =
          asRecord(images?.medium) ?? asRecord(images?.large) ?? asRecord(images?.small) ?? asRecord(images?.original);
        const url = safeString(sized?.url);
        return url
          ? { id: safeString(row?.id) || url, caption: safeString(row?.caption) || undefined, url }
          : null;
      })
      .filter((p): p is TripadvisorPhoto => p !== null);
    tripadvisorPhotosCache.set(cacheKey, {
      expiresAt: Date.now() + TRIPADVISOR_DETAILS_CACHE_TTL_MS,
      photos,
    });
    return photos;
  } catch {
    return [];
  }
}

function tripadvisorApiError(body: any): string {
  const error = asRecord(body?.error);
  return (
    pickString(error, ["message", "code"]) ||
    pickString(asRecord(body), ["message", "error_description"]) ||
    safeString(body?.error)
  );
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
      ? list.slice(0, 40).map((r: any, i: number) => mapTripadvisorReview(r, i, "zernio"))
      : [];
    const tripadvisorInfo = await fetchZernioTripadvisorInfo(zernio, zid, reviews);
    const averageRating = tripadvisorInfo?.rating ?? averageFromReviews(reviews);
    const reviewCount = tripadvisorInfo?.reviewCount ?? reviews.length;
    return {
      kind: "json",
      body: {
        profile: {
          name: tripadvisorInfo?.name || stored.displayName || stored.username || "Tripadvisor",
          location: tripadvisorInfo?.location || tripadvisorInfo?.address || "",
        },
        stats: { averageRating, reviewCount },
        reviews,
        ...(tripadvisorInfo ? { tripadvisorInfo: { ...tripadvisorInfo, reviews } } : {}),
        source: "zernio",
        note:
          reviews.length === 0 && !tripadvisorInfo
            ? "No Tripadvisor review or location information payload returned via Zernio yet."
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
          "Tripadvisor official API needs TRIPADVISOR_API_KEY and TRIPADVISOR_LOCATION_ID in .env.local (or reconnect).",
      },
    };
  }
  const lang = "en";
  const [detailsResult, reviewsResult, photos] = await Promise.all([
    fetchTripadvisorDetails(apiKey, locationId, lang),
    fetch(
      `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(locationId)}/reviews?key=${encodeURIComponent(apiKey)}&language=${lang}`,
      { headers: { Accept: "application/json" } }
    ),
    fetchTripadvisorPhotos(apiKey, locationId, lang),
  ]);
  const reviewsBody: any = await reviewsResult.json().catch(() => ({}));
  if (!detailsResult.res.ok && !reviewsResult.ok) {
    const taMsg = tripadvisorApiError(detailsResult.body) || tripadvisorApiError(reviewsBody);
    const status = detailsResult.res.status || reviewsResult.status || 502;
    if (status === 401 || status === 403) {
      return {
        kind: "error",
        status,
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
          : "Could not fetch Tripadvisor information from official API.",
      },
    };
  }

  const list = reviewsResult.ok ? extractReviewList(reviewsBody) : [];
  const reviews = list.slice(0, 50).map((r: any, i: number) => mapTripadvisorReview(r, i, "official"));
  const tripadvisorInfo = tripadvisorInfoFromPayload(
    detailsResult.res.ok ? detailsResult.body : {},
    "official",
    locationId,
    reviews
  );
  const reviewError = reviewsResult.ok ? "" : tripadvisorApiError(reviewsBody);
  const averageRating = tripadvisorInfo?.rating ?? averageFromReviews(reviews);
  const reviewCount = tripadvisorInfo?.reviewCount ?? reviews.length;
  return {
    kind: "json",
    body: {
      profile: {
        name: tripadvisorInfo?.name || stored.username || `Tripadvisor location ${locationId}`,
        location: tripadvisorInfo?.location || tripadvisorInfo?.address || "",
      },
      stats: { averageRating, reviewCount },
      reviews,
      ...(tripadvisorInfo ? { tripadvisorInfo: { ...tripadvisorInfo, photos, reviews } } : {}),
      source: "official",
      note: reviewsResult.ok
        ? undefined
        : reviewError
          ? `Tripadvisor location information loaded, but reviews could not be loaded: ${reviewError}`
          : "Tripadvisor location information loaded, but reviews could not be loaded from the official API.",
    },
  };
}
