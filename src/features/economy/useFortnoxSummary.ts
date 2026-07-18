import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { fetchFortnoxOverview, type FortnoxOverview } from "./economyClient";

/**
 * Fortnox invoice overview for the Economy tab and the Daily Brief signal.
 * The server caches summaries 10 min per account; staleTime mirrors that so
 * the brief never spams the Fortnox API. Silent — a bookkeeping hiccup must
 * not toast on Home.
 */
export function useFortnoxSummary(businessProfileId: string | null | undefined) {
  const { enabled } = useAuth();
  const query = useQuery<FortnoxOverview>({
    queryKey: ["fortnox-overview", businessProfileId ?? null],
    queryFn: ({ signal }) => fetchFortnoxOverview(businessProfileId as string, signal),
    enabled: Boolean(enabled && businessProfileId),
    staleTime: 10 * 60 * 1000,
    meta: { silent: true },
  });
  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
