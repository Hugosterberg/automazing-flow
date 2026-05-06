import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { Connection } from "@/types/connection";
import {
  listConnectionsForBusinessProfile,
  resumeConnection,
  softDisconnect,
} from "./connectionsService";
import { logActivity, ACTIVITY_FEED_KEY } from "@/features/activity";
import { apiUrl } from "@/lib/apiBase";

export const CONNECTIONS_KEY = ["connections"] as const;

/**
 * Tenant-scoped connections query. Business profile id is part of the query key,
 * so switching profiles naturally invalidates and re-fetches.
 */
export function useConnections(businessProfileId: string | null | undefined) {
  const { enabled, user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<Connection[]>({
    queryKey: [...CONNECTIONS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !enabled || !businessProfileId) return [];
      return listConnectionsForBusinessProfile(supabase, businessProfileId);
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 15_000,
  });

  const disconnectMut = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      await softDisconnect(supabase, connectionId);
      // Client-side path: the server disconnect endpoint also logs, but the
      // UI currently goes through Supabase RLS directly, so we log here to
      // keep the audit trail complete without rerouting the mutation.
      if (businessProfileId) {
        void logActivity(supabase, {
          businessProfileId,
          module: "connections",
          eventType: "connection.disconnected",
          subjectType: "connected_account",
          subjectId: connectionId,
          severity: "info",
          summary: "Disconnected a connected account",
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const resumeMut = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      await resumeConnection(supabase, connectionId);
      if (businessProfileId) {
        void logActivity(supabase, {
          businessProfileId,
          module: "connections",
          eventType: "connection.resumed",
          subjectType: "connected_account",
          subjectId: connectionId,
          severity: "info",
          summary: "Resumed a paused connection",
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const resyncMut = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!enabled) throw new Error("Not signed in.");
      const res = await fetch(
        apiUrl(`/api/connections/${encodeURIComponent(connectionId)}/resync?business_profile_id=${encodeURIComponent(businessProfileId ?? "")}`),
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Resync failed");
      }
      return res.json() as Promise<{ health: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });

  return {
    connections: query.data ?? [],
    active: (query.data ?? []).filter((c) => !c.disconnectedAt),
    disconnected: (query.data ?? []).filter((c) => Boolean(c.disconnectedAt)),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    disconnect: disconnectMut.mutateAsync,
    isDisconnecting: disconnectMut.isPending,
    resume: resumeMut.mutateAsync,
    isResuming: resumeMut.isPending,
    resync: resyncMut.mutateAsync,
    isResyncing: resyncMut.isPending,
    resyncingId: resyncMut.isPending ? (resyncMut.variables as string | undefined) : undefined,
  };
}
