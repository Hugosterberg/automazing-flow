import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { createLead, deleteLead, listLeads, updateLead, type Lead, type LeadInput } from "./leadsService";

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

  const createMut = useMutation({
    mutationFn: async (input: LeadInput) => {
      if (!businessProfileId) throw new Error("No active business profile.");
      return createLead(businessProfileId, input, user?.id ?? null);
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<LeadInput> }) => updateLead(id, patch),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteLead(id),
    onSuccess: invalidate,
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
  };
}
