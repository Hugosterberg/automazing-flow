import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/types/supabase";

export type ActivityEventRow = Tables<"activity_events">;

export const ACTIVITY_FEED_KEY = ["activity-feed"] as const;

export interface ActivityFeedFilters {
  /** When set, only events whose subject_type + subject_id match are returned. */
  subjectType?: string | null;
  subjectId?: string | null;
  /** When set, filter by event_module. */
  module?: string | null;
  /** Hard cap on rows fetched. Default 50. */
  limit?: number;
}

/**
 * Tenant-scoped activity feed over `public.activity_events`. Read-only.
 *
 * Supports both "all activity for this business profile" (no filters) and
 * "recent activity about this specific subject" (subjectType + subjectId).
 *
 * Empty list is a valid, common state — tenants only recently created have
 * few events. The hook never throws for a missing profile; it just returns
 * an empty array while disabled.
 */
export function useActivityFeed(
  businessProfileId: string | null | undefined,
  filters: ActivityFeedFilters = {}
) {
  const { enabled } = useAuth();
  const { subjectType, subjectId, module, limit = 50 } = filters;

  const query = useQuery<ActivityEventRow[]>({
    queryKey: [
      ...ACTIVITY_FEED_KEY,
      businessProfileId ?? null,
      subjectType ?? null,
      subjectId ?? null,
      module ?? null,
      limit,
    ],
    queryFn: async () => {
      if (!supabase || !enabled || !businessProfileId) return [];
      let q = supabase
        .from("activity_events")
        .select("*")
        .eq("business_profile_id", businessProfileId)
        .order("occurred_at", { ascending: false })
        .limit(limit);

      if (module) q = q.eq("module", module);
      if (subjectType) q = q.eq("subject_type", subjectType);
      if (subjectId) q = q.eq("subject_id", subjectId);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 20_000,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
