import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { logActivity, ACTIVITY_FEED_KEY } from "@/features/activity";
import {
  generateAiRecommendations,
  listAiRecommendations,
  setAiRecommendationStatus,
  type AiRecommendationRow,
  type AiRecommendationStatus,
  type GenerateAiRecommendationsResult,
} from "./aiRecommendationsService";

export const AI_RECS_KEY = ["ai-recommendations"] as const;

/**
 * Tenant-scoped AI recommendations. Same hook shape as tasks/connections.
 *
 * We intentionally do NOT auto-bulk-mark `new` → `seen` on mount — that's
 * an opinionated UX decision better made per-card or via a future "open
 * inbox" gesture. Status transitions stay explicit user actions for now.
 */
export function useAiRecommendations(
  businessProfileId: string | null | undefined
) {
  const { enabled, user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<AiRecommendationRow[]>({
    queryKey: [...AI_RECS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !enabled || !businessProfileId) return [];
      return listAiRecommendations(supabase, businessProfileId);
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 30_000,
  });

  const transitionMut = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: AiRecommendationStatus;
    }) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      const rec = await setAiRecommendationStatus(supabase, id, status);

      // Only log "meaningful" transitions. Marking `seen` is low-signal and
      // would flood the feed, so we skip it. Accept/dismiss are explicit
      // user decisions worth an audit row.
      if (
        businessProfileId &&
        (status === "accepted" || status === "dismissed")
      ) {
        void logActivity(supabase, {
          businessProfileId,
          module: "ai_recommendations",
          eventType:
            status === "accepted"
              ? "ai_recommendation.accepted"
              : "ai_recommendation.dismissed",
          subjectType: "ai_recommendation",
          subjectId: id,
          severity: status === "accepted" ? "success" : "info",
          summary:
            status === "accepted"
              ? `Accepted recommendation "${rec.title}"`
              : `Dismissed recommendation "${rec.title}"`,
          payload: { kind: rec.kind },
        });
      }
      return rec;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: AI_RECS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const generateMut = useMutation<GenerateAiRecommendationsResult, Error, void>({
    mutationFn: async () => {
      if (!businessProfileId) throw new Error("No active business profile.");
      return generateAiRecommendations(businessProfileId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: AI_RECS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  return {
    recommendations: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    transition: transitionMut.mutateAsync,
    isTransitioning: transitionMut.isPending,
    generate: generateMut.mutateAsync,
    isGenerating: generateMut.isPending,
  };
}
