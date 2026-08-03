/**
 * Judge.me account-data handler.
 *
 * Fetches up to two pages of reviews via the official API and returns the
 * same envelope shape the Reviews page consumes for Google/Tripadvisor:
 * profile + stats + reviews (+ a judgemeInfo panel for the Verksamhet tab
 * with verified/picture counts and a per-star rating distribution).
 *
 * Responses are cached in-memory for a short TTL per shop: the Reviews page
 * auto-refetches every 2 minutes and multiple viewers would otherwise
 * multiply identical 100-review pulls against Judge.me's quota.
 */

import {
  fetchJudgemeReviewCount,
  fetchJudgemeReviews,
  judgemeCredentialsFromStored,
  type JudgemeCredentials,
  type JudgemeReview,
} from "../providers/judgeme.ts";
import type { PlatformHandlerResult } from "./types.ts";

const JUDGEME_DATA_CACHE_TTL_MS = 90_000;
const judgemeDataCache = new Map<string, { expiresAt: number; body: unknown }>();

function averageRating(reviews: JudgemeReview[]): number | undefined {
  const rated = reviews.filter((r) => typeof r.rating === "number" && r.rating > 0);
  if (rated.length === 0) return undefined;
  return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
}

/** Reviews per star 1..5, keyed as strings for a stable JSON shape. */
function ratingCounts(reviews: JudgemeReview[]): Record<string, number> {
  const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const review of reviews) {
    const rating = Math.round(review.rating ?? 0);
    if (rating >= 1 && rating <= 5) counts[String(rating)] += 1;
  }
  return counts;
}

async function buildJudgemeAccountData(
  creds: JudgemeCredentials,
  stored: Record<string, unknown>
): Promise<PlatformHandlerResult> {
  // Two pages of 100 keeps the payload bounded while covering most stores;
  // the count endpoint still reports the true total beyond the cap.
  const [first, totalCount] = await Promise.all([
    fetchJudgemeReviews(creds, { page: 1, perPage: 100 }),
    fetchJudgemeReviewCount(creds),
  ]);
  if (!first.ok) {
    return {
      kind: "error",
      status: first.status === 401 || first.status === 403 ? 401 : 502,
      body: { error: first.error },
    };
  }
  let reviews = first.reviews ?? [];
  if (reviews.length === 100) {
    const second = await fetchJudgemeReviews(creds, { page: 2, perPage: 100 });
    if (second.ok) reviews = reviews.concat(second.reviews ?? []);
  }

  const visible = reviews.filter((r) => !r.hidden);
  const withPictures = visible.filter((r) => r.pictures.length > 0).length;
  const verifiedCount = visible.filter((r) => r.verified).length;

  return {
    kind: "json",
    body: {
      profile: {
        name: String(stored.displayName || stored.username || creds.shopDomain),
        location: "",
      },
      stats: {
        averageRating: averageRating(visible),
        reviewCount: totalCount ?? visible.length,
      },
      reviews: visible.map((r) => ({
        id: r.id,
        author: r.author,
        rating: r.rating,
        title: r.title,
        text: r.text,
        createdAt: r.createdAt,
        url: "",
        pictures: r.pictures,
        verified: r.verified,
        source: "judgeme",
      })),
      judgemeInfo: {
        source: "official" as const,
        shopDomain: creds.shopDomain,
        website: `https://${creds.shopDomain}`,
        totalCount: totalCount ?? undefined,
        verifiedCount,
        withPicturesCount: withPictures,
        ratingCounts: ratingCounts(visible),
      },
      source: "official",
      note:
        visible.length === 0
          ? "Judge.me returned no reviews yet. New reviews appear here as customers submit them."
          : undefined,
    },
  };
}

export async function handleJudgemeAccountData(args: {
  stored: Record<string, unknown>;
}): Promise<PlatformHandlerResult> {
  const creds = judgemeCredentialsFromStored(args.stored);
  if (!creds) {
    return {
      kind: "error",
      status: 400,
      body: {
        error:
          "Judge.me needs a shop domain and private API token. Reconnect via Connections → Judge.me.",
      },
    };
  }

  const cached = judgemeDataCache.get(creds.shopDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return { kind: "json", body: cached.body };
  }

  const result = await buildJudgemeAccountData(creds, args.stored);
  if (result.kind === "json") {
    judgemeDataCache.set(creds.shopDomain, {
      expiresAt: Date.now() + JUDGEME_DATA_CACHE_TTL_MS,
      body: result.body,
    });
  }
  return result;
}
