import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { logActivity, ACTIVITY_FEED_KEY } from "@/features/activity";
import { createLead, createLeads, deleteLead, listLeads, updateLead, type Lead, type LeadInput } from "./leadsService";

export const LEADS_KEY = ["leads"] as const;

/**
 * Tenant-scoped sales leads. Same shape as useTasks: one query plus a small set
 * of mutations that invalidate the query on success.
 */
export function useLeads(businessProfileId: string | null | undefined) {
  const { enabled, user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<Lead[]>({
    queryKey: [...LEADS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !enabled || !businessProfileId) return [];
      return listLeads(businessProfileId);
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 20_000,
    // Silent so a not-yet-applied migration (no `leads` table) degrades to an
    // empty list instead of a global error toast. Mutations still surface their
    // own errors.
    meta: { silent: true },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: LEADS_KEY });

  // Fire-and-forget activity logging so the notifications bell + Activity feed
  // reflect sales actions. Failures never block the primary write.
  function log(eventType: string, lead: Lead, severity: "info" | "success", summary: string) {
    if (!supabase || !businessProfileId) return;
    void logActivity(supabase, {
      businessProfileId,
      module: "sales",
      eventType,
      subjectType: "lead",
      subjectId: lead.id,
      severity,
      summary,
    });
    void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
  }

  const createMut = useMutation({
    mutationFn: async (input: LeadInput) => {
      if (!businessProfileId) throw new Error("No active business profile.");
      return createLead(businessProfileId, input, user?.id ?? null);
    },
    onSuccess: (lead) => {
      invalidate();
      log("lead.created", lead, "info", `Added lead "${lead.company}"`);
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<LeadInput> }) => updateLead(id, patch),
    onSuccess: (lead, { patch }) => {
      invalidate();
      if (patch.status === "won") log("lead.won", lead, "success", `Won lead "${lead.company}" 🎉`);
      else if (patch.status === "lost") log("lead.lost", lead, "info", `Marked "${lead.company}" as lost`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteLead(id),
    onSuccess: invalidate,
  });

  const importMut = useMutation({
    mutationFn: async (inputs: LeadInput[]) => {
      if (!businessProfileId) throw new Error("No active business profile.");
      return createLeads(businessProfileId, inputs, user?.id ?? null);
    },
    onSuccess: (count) => {
      invalidate();
      if (supabase && businessProfileId && count > 0) {
        void logActivity(supabase, {
          businessProfileId,
          module: "sales",
          eventType: "leads.imported",
          severity: "info",
          summary: `Imported ${count} lead${count === 1 ? "" : "s"} from CSV`,
        });
        void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
      }
    },
  });

  return {
    leads: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createLead: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updateLead: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    deleteLead: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
    importLeads: importMut.mutateAsync,
    isImporting: importMut.isPending,
  };
}
