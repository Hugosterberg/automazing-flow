/** Custom events for page-level silent refresh (non–React Query surfaces). */
export const LIVE_SYNC_MESSAGES = "automazing:sync-messages";
export const LIVE_SYNC_REVIEWS = "automazing:sync-reviews";

export function dispatchLiveSync(scope: "messages" | "reviews" | "all"): void {
  if (scope === "messages" || scope === "all") {
    window.dispatchEvent(new CustomEvent(LIVE_SYNC_MESSAGES));
  }
  if (scope === "reviews" || scope === "all") {
    window.dispatchEvent(new CustomEvent(LIVE_SYNC_REVIEWS));
  }
}
