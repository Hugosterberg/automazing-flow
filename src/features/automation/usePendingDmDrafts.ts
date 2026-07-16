import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAutoReplyLog, type AutoReplyLogEntry } from "./automationService";

export const PENDING_DM_DRAFTS_KEY = ["pending-dm-drafts"] as const;

function isPendingDmDraft(entry: AutoReplyLogEntry): boolean {
  return entry.status === "drafted" && entry.kind === "dm" && Boolean(entry.draft_text?.trim());
}

/**
 * Pending DM auto-reply drafts for a business profile (draft-before-send queue).
 * Shared by Messages strip, Daily Brief, and Automations.
 */
export function usePendingDmDrafts(businessProfileId: string | null | undefined) {
  const query = useQuery({
    queryKey: [...PENDING_DM_DRAFTS_KEY, businessProfileId ?? null],
    queryFn: async () => {
      if (!businessProfileId) return [] as AutoReplyLogEntry[];
      const payload = await fetchAutoReplyLog(businessProfileId, 40);
      return (payload.entries || []).filter(isPendingDmDraft);
    },
    enabled: Boolean(businessProfileId),
    staleTime: 45_000,
    meta: { silent: true },
  });

  return {
    drafts: query.data ?? [],
    count: query.data?.length ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useInvalidatePendingDmDrafts() {
  const qc = useQueryClient();
  return (businessProfileId?: string | null) => {
    if (businessProfileId) {
      void qc.invalidateQueries({ queryKey: [...PENDING_DM_DRAFTS_KEY, businessProfileId] });
      return;
    }
    void qc.invalidateQueries({ queryKey: PENDING_DM_DRAFTS_KEY });
  };
}
