import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { BusinessProfile, BusinessProfileInput } from "@/types/businessProfile";
import {
  createBusinessProfile,
  deleteBusinessProfile,
  listBusinessProfiles,
  updateBusinessProfile,
} from "./businessProfilesService";
import { logActivity, ACTIVITY_FEED_KEY } from "@/features/activity";

export const BUSINESS_PROFILES_KEY = ["business-profiles"] as const;

export function useBusinessProfiles() {
  const { enabled, user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<BusinessProfile[]>({
    queryKey: [...BUSINESS_PROFILES_KEY, user?.id ?? null],
    queryFn: async () => {
      if (!supabase || !enabled) return [];
      return listBusinessProfiles(supabase);
    },
    enabled: Boolean(supabase && enabled && user?.id),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async (input: BusinessProfileInput) => {
      if (!supabase || !enabled || !user?.id) {
        throw new Error("Not signed in.");
      }
      const created = await createBusinessProfile(supabase, user.id, input);
      // Fire-and-forget audit log. Scoped to the new profile itself so it
      // surfaces on that profile's activity feed after selection.
      void logActivity(supabase, {
        businessProfileId: created.id,
        module: "business_profile",
        eventType: "business_profile.created",
        subjectType: "business_profile",
        subjectId: created.id,
        severity: "success",
        summary: `Created business profile "${created.name}"`,
      });
      return created;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BUSINESS_PROFILES_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<BusinessProfileInput>;
    }) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      const updated = await updateBusinessProfile(supabase, id, updates);
      void logActivity(supabase, {
        businessProfileId: updated.id,
        module: "business_profile",
        eventType: "business_profile.updated",
        subjectType: "business_profile",
        subjectId: updated.id,
        severity: "info",
        summary: `Updated business profile "${updated.name}"`,
        payload: { changedFields: Object.keys(updates) },
      });
      return updated;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BUSINESS_PROFILES_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      // We don't log `business_profile.deleted` because activity_events
      // cascade-delete with the owning profile (see 20260418000000_core_modules.sql),
      // so the log row would vanish immediately. If cross-tenant audit becomes a
      // requirement, move the log to a system/global table first.
      await deleteBusinessProfile(supabase, id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BUSINESS_PROFILES_KEY });
    },
  });

  return {
    profiles: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    createProfile: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updateProfile: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    deleteProfile: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
  };
}
