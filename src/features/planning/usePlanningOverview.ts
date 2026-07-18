import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { fetchPlanningOverview, type PlanningOverview } from "./planningClient";

/**
 * Forward-looking planning signals (Swedish holidays/klämdagar, weather for
 * the profile's town, FX). All sources are free and keyless; the server
 * caches upstream calls, so a generous staleTime keeps the dashboard cheap.
 */
export function usePlanningOverview(options?: { location?: string | null; includeFx?: boolean }) {
  const { enabled } = useAuth();
  const location = options?.location?.trim() || null;
  const includeFx = options?.includeFx ?? true;
  const query = useQuery<PlanningOverview>({
    queryKey: ["planning-overview", location, includeFx],
    queryFn: () => fetchPlanningOverview({ location, includeFx }),
    enabled: Boolean(enabled),
    staleTime: 30 * 60 * 1000,
    meta: { silent: true },
  });
  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
  };
}
