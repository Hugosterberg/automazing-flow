import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { accountDataUrl } from "@/lib/accountDataUrl";
import type { ConnectedAccount } from "@/types/accounts";

export type ReviewPreview = {
  id: string;
  author: string;
  rating?: number;
  text: string;
};

function sortReviewAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "google_reviews" ? 0 : p === "tripadvisor" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

function isReviewAccount(account: ConnectedAccount): boolean {
  return (account.platform === "google_reviews" || account.platform === "tripadvisor") && Boolean(account.isOAuth);
}

/** Lightweight review index for ⌘K — pending replies only. */
export async function fetchReviewsPreview(
  accounts: ConnectedAccount[],
  businessProfileId: string | null,
  repliedIds: Set<string>,
  signal?: AbortSignal
): Promise<ReviewPreview[]> {
  if (!businessProfileId) return [];
  const account = accounts.filter(isReviewAccount).sort(sortReviewAccounts)[0];
  if (!account) return [];

  const res = await fetchWithTimeout(accountDataUrl(account.id, businessProfileId), {
    credentials: "include",
    signal,
  });
  if (!res.ok) return [];

  const data = (await res.json().catch(() => ({}))) as { reviews?: unknown[] };
  const list = Array.isArray(data.reviews) ? data.reviews : [];

  const mapped: ReviewPreview[] = list.map((raw, index) => {
    const review = raw as Record<string, unknown>;
    return {
      id: String(review.id ?? index),
      author: String(review.author ?? "Anonym"),
      rating: typeof review.rating === "number" ? review.rating : undefined,
      text: String(review.text ?? ""),
    };
  });

  return mapped
    .filter((review) => !repliedIds.has(review.id) && review.text.trim().length > 0)
    .slice(0, 10);
}
