import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { supabase } from "@/lib/supabase";
import { prefetchRoute } from "@/lib/routePrefetch";
import { prefetchRouteData } from "@/lib/routeDataPrefetch";

/**
 * Returns a stable `(path) => void` that warms both the JS chunk and the
 * primary React Query cache for a destination route.
 *
 * Designed for `onPointerEnter` / `onFocus` on links that live under the
 * app shell (sidebar, home page tiles). On hover we do fire-and-forget
 * work — any error is swallowed, and the actual page mount takes over
 * if something goes wrong.
 *
 * Uses the active business profile from the same resolution order as
 * the data-layer hooks (`useActiveBusinessProfileIdOptional` first,
 * falling back to the legacy `AccountsContext.activeProfileId`) so the
 * prefetched cache key matches what the page will request.
 */
export function useRoutePrefetch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeProfileId } = useAccounts();
  const activeBpId = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBpId ?? activeProfileId ?? null;

  return useCallback(
    (path: string) => {
      prefetchRoute(path);
      prefetchRouteData(path, {
        queryClient,
        supabase,
        userId: user?.id ?? null,
        businessProfileId,
      });
    },
    [queryClient, user?.id, businessProfileId]
  );
}
