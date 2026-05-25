/**
 * Route chunk prefetchers.
 *
 * The sidebar wires these to `onPointerEnter` / `onFocus` on each nav link
 * so the route's JS chunk begins downloading the moment a user hovers or
 * tabs to the link — making `React.lazy` load feel instant on click.
 *
 * Each entry uses the exact same dynamic-import path as the route in
 * `src/App.tsx`, so Vite/Rollup deduplicate them into the same chunk.
 * Adding a path here is safe; forgetting one just means that route does
 * not benefit from hover-prefetch.
 */
type Prefetcher = () => Promise<unknown>;

const prefetchers: Record<string, Prefetcher> = {
  "/social-media": () => import("@/pages/SocialMedia"),
  "/ecommerce": () => import("@/pages/Ecommerce"),
  "/sales": () => import("@/pages/SalesMarketing"),
  "/marketing": () => import("@/pages/Marketing"),
  "/digital-brand": () => import("@/pages/DigitalBrand"),
  "/sales-marketing": () => import("@/pages/SalesMarketing"),
  "/customers": () => import("@/pages/Customers"),
  "/calendar": () => import("@/pages/CalendarPage"),
  "/messages": () => import("@/pages/Messages"),
  "/reviews": () => import("@/pages/Reviews"),
  "/content": () => import("@/pages/Content"),
  "/tasks": () => import("@/pages/Tasks"),
  "/activity": () => import("@/pages/Activity"),
  "/ai-recommendations": () => import("@/pages/AIRecommendations"),
  "/preferences": () => import("@/pages/Preferences"),
  "/connections": () => import("@/pages/ConnectionsPage"),
  "/integrations": () => import("@/pages/ConnectionsPage"),
};

// Remember which routes have already been requested so rapid repeated
// hovers don't re-trigger network work or error handlers.
const primed = new Set<string>();

/**
 * Fire-and-forget prefetch for a given route path. Silently no-ops for
 * unknown paths or when the chunk has already been primed. Errors are
 * swallowed — the actual navigation will surface any real failure.
 */
export function prefetchRoute(path: string): void {
  if (primed.has(path)) return;
  const prefetcher = prefetchers[path];
  if (!prefetcher) return;
  primed.add(path);
  prefetcher().catch(() => {
    // Allow a future retry (e.g. offline → online) by forgetting the prime.
    primed.delete(path);
  });
}
