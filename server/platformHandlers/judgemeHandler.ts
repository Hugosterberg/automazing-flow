/**
 * Judge.me account-data handler.
 *
 * Fetches up to two pages of reviews via the official API and returns the
 * same envelope shape the Reviews page consumes for Google/Tripadvisor:
 * profile + stats + reviews (+ a judgemeInfo panel for the Verksamhet tab).
 */

import {
  fetchJudgemeReviews,
  judgemeCredentialsFromStored,
  type JudgemeReview,
} from "../providers/judgeme.ts";
import type { PlatformHandlerResult } from "./types.ts";

function averageRating(reviews: JudgemeReview[]): number | undefined {
  const rated = reviews.filter((r) => typeof r.rating === "number" && r.rating > 0);
  if (rated.length === 0) return undefined;
  return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
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

  // Two pages of 100 keeps the payload bounded while covering most stores.
  const first = await fetchJudgemeReviews(creds, { page: 1, perPage: 100 });
  if (!first.ok) {
    return { kind: "error", status: first.status === 401 || first.status === 403 ? 401 : 502, body: { error: first.error } };
  }
  let reviews = first.reviews;
  if (reviews.length === 100) {
    const second = await fetchJudgemeReviews(creds, { page: 2, perPage: 100 });
    if (second.ok) reviews = reviews.concat(second.reviews);
  }

  const visible = reviews.filter((r) => !r.hidden);
  const withPictures = visible.filter((r) => r.pictures.length > 0).length;
  const verifiedCount = visible.filter((r) => r.verified).length;

  return {
    kind: "json",
    body: {
      profile: {
        name: String(args.stored.displayName || args.stored.username || creds.shopDomain),
        location: "",
      },
      stats: {
        averageRating: averageRating(visible),
        reviewCount: visible.length,
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
        verifiedCount,
        withPicturesCount: withPictures,
      },
      source: "official",
      note:
        visible.length === 0
          ? "Judge.me returned no reviews yet. New reviews appear here as customers submit them."
          : undefined,
    },
  };
}
