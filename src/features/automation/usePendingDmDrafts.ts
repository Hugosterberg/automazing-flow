import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfileDocument } from "@/features/profile-documents";
import { DEMO_MODE_DOC_KEY, type DemoModeDoc } from "@/features/demo/demoMode";
import { fetchAutoReplyLog, type AutoReplyLogEntry } from "./automationService";

export const PENDING_DM_DRAFTS_KEY = ["pending-dm-drafts"] as const;

function isPendingDmDraft(entry: AutoReplyLogEntry): boolean {
  return entry.status === "drafted" && entry.kind === "dm" && Boolean(entry.draft_text?.trim());
}

/**
 * Pending DM auto-reply drafts for a business profile (draft-before-send queue).
 * Shared by Messages strip, Daily Brief, and Automations.
 * When demoläge is on, merges client-only sample drafts from the demo-mode doc.
 */
export function usePendingDmDrafts(businessProfileId: string | null | undefined) {
  const demoDoc = useProfileDocument<DemoModeDoc>(DEMO_MODE_DOC_KEY, { enabled: false });
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

  const drafts = useMemo(() => {
    const live = query.data ?? [];
    if (!demoDoc.data?.enabled) return live;
    const demo = (demoDoc.data.dmDrafts ?? []).filter(isPendingDmDraft) as AutoReplyLogEntry[];
    const liveIds = new Set(live.map((d) => d.id));
    return [...live, ...demo.filter((d) => !liveIds.has(d.id))];
  }, [demoDoc.data?.dmDrafts, demoDoc.data?.enabled, query.data]);

  return {
    drafts,
    count: drafts.length,
    isLoading: query.isLoading || demoDoc.isLoading,
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
