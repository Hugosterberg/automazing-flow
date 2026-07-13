import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import {
  createTrackingSite,
  fetchCompaniesOverview,
  fetchTrackingSite,
  fetchTrackingSummary,
  type CompanyOverview,
  type TrackingSite,
  type VisitSummary,
} from "./siteAnalyticsService";

export const TRACKING_SITE_KEY = ["tracking-site"] as const;
export const TRACKING_SUMMARY_KEY = ["tracking-summary"] as const;
export const COMPANIES_OVERVIEW_KEY = ["companies-overview"] as const;

/** Site key + activation state for the active profile's tracking snippet. */
export function useTrackingSite(businessProfileId: string | null) {
  const { enabled, user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<TrackingSite>({
    queryKey: [...TRACKING_SITE_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: () => fetchTrackingSite(businessProfileId as string),
    enabled: Boolean(enabled && businessProfileId),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

  const createMut = useMutation({
    mutationFn: (options: { rotate?: boolean } = {}) =>
      createTrackingSite(businessProfileId as string, options),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TRACKING_SITE_KEY });
    },
  });

  return {
    site: query.data ?? null,
    isLoading: query.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
  };
}

/** Visitor stats for the active profile (chart + top lists). */
export function useTrackingSummary(businessProfileId: string | null, days = 30) {
  const { enabled, user } = useAuth();
  const query = useQuery<VisitSummary>({
    queryKey: [...TRACKING_SUMMARY_KEY, user?.id ?? null, businessProfileId ?? null, days],
    queryFn: () => fetchTrackingSummary(businessProfileId as string, days),
    enabled: Boolean(enabled && businessProfileId),
    staleTime: 60_000,
    meta: { silent: true },
  });
  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** 7-day visitors/sales/followers for every company the user is a member of. */
export function useCompaniesOverview() {
  const { enabled, user } = useAuth();
  const query = useQuery<CompanyOverview[]>({
    queryKey: [...COMPANIES_OVERVIEW_KEY, user?.id ?? null],
    queryFn: async () => (await fetchCompaniesOverview()).companies,
    enabled: Boolean(enabled),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  return { companies: query.data ?? [], isLoading: query.isLoading };
}
