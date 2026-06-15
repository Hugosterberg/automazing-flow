import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentsService";

export const PROFILE_DOCUMENT_KEY = ["profile-document"] as const;

interface ProfileDocumentOptions<T> {
  /** Read the legacy localStorage value to migrate (and to fall back to pre-migration). */
  legacyRead?: (businessProfileId: string) => T | undefined;
  /** Persist locally if the DB write fails (e.g. before the migration is applied). */
  legacyWrite?: (businessProfileId: string, value: T) => void;
}

/**
 * Durable, cross-device per-profile document backed by `profile_documents`.
 * Drop-in replacement for a localStorage blob: returns the current value, a
 * `save`, and a loading flag, scoped to the active business profile.
 *
 * Migration is automatic and lossless: the first load with an empty DB row
 * pushes the existing localStorage value up. If the DB is unavailable (e.g. the
 * migration hasn't been applied yet) it transparently reads/writes localStorage
 * instead, so there is never a regression — only an upgrade once the table
 * exists.
 */
export function useProfileDocument<T>(key: string, fallback: T, options?: ProfileDocumentOptions<T>) {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { enabled, user } = useAuth();
  const qc = useQueryClient();
  const queryKey = [...PROFILE_DOCUMENT_KEY, user?.id ?? null, businessProfileId ?? null, key];

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      if (!businessProfileId) return fallback;
      try {
        const existing = await loadProfileDocument<T>(businessProfileId, key);
        if (existing !== undefined) return existing;
        const legacy = options?.legacyRead?.(businessProfileId);
        if (legacy !== undefined) {
          // One-time migration of the device-local value into the DB.
          try {
            await saveProfileDocument(businessProfileId, key, legacy, user?.id);
          } catch {
            /* best effort — value is still returned below */
          }
          return legacy;
        }
        return fallback;
      } catch {
        // DB unavailable (e.g. migration not yet applied) — keep working off
        // the local copy so nothing breaks or disappears.
        return options?.legacyRead?.(businessProfileId) ?? fallback;
      }
    },
    enabled: Boolean(enabled && businessProfileId),
    staleTime: 30_000,
    meta: { silent: true },
  });

  const mutation = useMutation<T, unknown, T, { prev: T | undefined }>({
    mutationFn: async (value: T) => {
      if (!businessProfileId) return value;
      try {
        await saveProfileDocument(businessProfileId, key, value, user?.id);
      } catch {
        // Fall back to local persistence so edits are never lost.
        options?.legacyWrite?.(businessProfileId, value);
      }
      return value;
    },
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<T>(queryKey);
      qc.setQueryData(queryKey, value);
      return { prev };
    },
    onError: (_err, _value, ctx) => {
      if (ctx && ctx.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
    },
  });

  return {
    data: (query.data ?? fallback) as T,
    isLoading: query.isLoading,
    isReady: !businessProfileId || query.isSuccess,
    save: (value: T) => mutation.mutate(value),
    isSaving: mutation.isPending,
    businessProfileId,
  };
}
