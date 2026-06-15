import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export const UNREAD_DM_KEY = ["unread-dm-count"] as const;

/**
 * Unread inbox DM count for the daily brief. Hits the lightweight
 * /api/messages/unread-count endpoint (one Zernio call, no message bodies) so
 * the home page stays fast. Marked `silent` so a transient Zernio hiccup never
 * pops a toast on the dashboard, and degrades to 0 on any error.
 */
export function useUnreadDmCount() {
  const { enabled, user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const query = useQuery({
    queryKey: [...UNREAD_DM_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      const res = await fetchWithTimeout(
        apiUrl(
          `/api/messages/unread-count${
            businessProfileId ? `?business_profile_id=${encodeURIComponent(businessProfileId)}` : ""
          }`,
        ),
        {
          credentials: "include",
        },
      );
      if (!res.ok) return 0;
      const body = await res.json().catch(() => ({}));
      return Number((body as { count?: unknown })?.count ?? 0) || 0;
    },
    enabled: Boolean(enabled),
    staleTime: 60_000,
    meta: { silent: true },
  });
  return { unreadDms: query.data ?? 0, isLoading: query.isLoading };
}
