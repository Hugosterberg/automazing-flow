import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/types/supabase";

export type SyncRunRow = Tables<"sync_runs">;

export const SYNC_RUNS_KEY = ["connection-sync-runs"] as const;

/**
 * Recent sync runs for a single connection. Used by the details drawer.
 *
 * Safe to call with a null/undefined connection id — the query stays
 * disabled and returns []. Rows land here when the server writes to
 * `sync_runs` during reconcile/sync work. For platforms that haven't
 * been wired to write sync runs yet, this returns an empty list and
 * the drawer renders an empty state.
 */
export function useSyncRuns(
  connectionId: string | null | undefined,
  limit = 20
) {
  const { enabled } = useAuth();

  const query = useQuery<SyncRunRow[]>({
    queryKey: [...SYNC_RUNS_KEY, connectionId ?? null, limit],
    queryFn: async () => {
      if (!supabase || !enabled || !connectionId) return [];
      const { data, error } = await supabase
        .from("sync_runs")
        .select("*")
        .eq("connected_account_id", connectionId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(supabase && enabled && connectionId),
    staleTime: 30_000,
  });

  return {
    runs: query.data ?? [],
    lastSuccessfulAt: (query.data ?? []).find(
      (r) => r.status === "success" && r.finished_at
    )?.finished_at as string | null | undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
