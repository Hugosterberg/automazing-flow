import type { QueryClient } from "@tanstack/react-query";
import type { TypedSupabaseClient } from "@/lib/supabase";
import { AI_RECS_KEY } from "@/features/ai-recommendations/useAiRecommendations";
import { listAiRecommendations } from "@/features/ai-recommendations/aiRecommendationsService";
import { CONNECTIONS_KEY } from "@/features/connections/useConnections";
import { listConnectionsForBusinessProfile } from "@/features/connections/connectionsService";
import { TASKS_KEY } from "@/features/tasks/useTasks";
import { listTasks } from "@/features/tasks/tasksService";

/**
 * Route data prefetchers.
 *
 * Companion to `routePrefetch.ts`. When the sidebar is hovered/focused we
 * also warm the React Query cache for the destination route's primary
 * query, so the page renders populated on click instead of flashing a
 * loading state.
 *
 * Scope: only routes where a single business-profile-scoped query is the
 * page's dominant cost. Account-scoped data (messages, content, reviews)
 * needs a selected account that the sidebar doesn't always have here —
 * those would prefetch the wrong cache key and are skipped on purpose.
 *
 * These imports are intentionally static. The same feature modules are already
 * used by the route tree, so dynamic imports here do not create smaller chunks.
 */

export interface RouteDataPrefetchContext {
  queryClient: QueryClient;
  supabase: TypedSupabaseClient | null;
  userId: string | null;
  businessProfileId: string | null;
}

type Prefetcher = (ctx: RouteDataPrefetchContext) => Promise<unknown>;

const prefetchers: Record<string, Prefetcher> = {
  "/connections": async (ctx) => {
    if (!ctx.supabase || !ctx.businessProfileId) return;
    return ctx.queryClient.prefetchQuery({
      queryKey: [...CONNECTIONS_KEY, ctx.userId, ctx.businessProfileId],
      queryFn: () =>
        listConnectionsForBusinessProfile(ctx.supabase!, ctx.businessProfileId!),
      staleTime: 15_000,
    });
  },

  "/integrations": async (ctx) => prefetchers["/connections"](ctx),

  "/tasks": async (ctx) => {
    if (!ctx.supabase || !ctx.businessProfileId) return;
    return ctx.queryClient.prefetchQuery({
      queryKey: [...TASKS_KEY, ctx.userId, ctx.businessProfileId],
      queryFn: () => listTasks(ctx.supabase!, ctx.businessProfileId!),
      staleTime: 20_000,
    });
  },

  "/ai-recommendations": async (ctx) => {
    if (!ctx.supabase || !ctx.businessProfileId) return;
    return ctx.queryClient.prefetchQuery({
      queryKey: [...AI_RECS_KEY, ctx.userId, ctx.businessProfileId],
      queryFn: () =>
        listAiRecommendations(ctx.supabase!, ctx.businessProfileId!),
      staleTime: 30_000,
    });
  },
};

// Debounce per-path so rapid hover + focus don't trigger repeated round
// trips. React Query itself dedupes concurrent fetches, but we also want
// to avoid doing bookkeeping work for every mouse jiggle.
const inflight = new Set<string>();

/**
 * Fire-and-forget data prefetch for a given route. No-ops for unknown
 * paths, missing supabase client, or missing business profile. Errors
 * are swallowed — the actual query will surface any real failure when
 * the page mounts.
 */
export function prefetchRouteData(
  path: string,
  ctx: RouteDataPrefetchContext
): void {
  const prefetcher = prefetchers[path];
  if (!prefetcher) return;
  if (inflight.has(path)) return;
  inflight.add(path);
  prefetcher(ctx)
    .catch(() => {
      // swallow — the real query on mount will retry and surface errors
    })
    .finally(() => {
      // Allow re-prefetch after staleTime elapses on the actual query by
      // freeing the lock. React Query handles dedupe at the query level.
      inflight.delete(path);
    });
}
