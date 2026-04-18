import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * App-wide React Query client with global error handling.
 *
 * Rationale:
 *   Without a global handler, a failed query or mutation surfaces only as
 *   a rejected promise inside the hook. The UI then either renders stale
 *   data indefinitely (cached hit) or stays in a loading-like state
 *   (first load) while the user has no idea something broke. This module
 *   wires a single toast + console log for every unhandled failure.
 *
 * Opt-out:
 *   Callers that render their own error UI can set `meta: { silent: true }`
 *   on a `useQuery` / `useMutation` call to skip the global toast.
 *
 * Noise control:
 *   - Query errors are suppressed when cached data already exists, because
 *     a background refetch that fails is not user-blocking and the UI
 *     still shows the previous result.
 *   - Toasts are deduped via a stable id so a single upstream outage that
 *     triggers many parallel queries does not spam the screen.
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  // Supabase-js v2 rejects with plain objects ({ message, code, details, hint })
  // — not Error instances — so pull the message out manually.
  if (error && typeof error === "object") {
    const obj = error as { message?: unknown; code?: unknown };
    if (typeof obj.message === "string" && obj.message.trim()) {
      return typeof obj.code === "string" && obj.code
        ? `${obj.message} (${obj.code})`
        : obj.message;
    }
  }
  return "Something went wrong. Please try again.";
}

function isSilent(meta: Record<string, unknown> | undefined): boolean {
  return Boolean(meta && meta.silent === true);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) return;
      if (isSilent(query.meta)) return;

      const keyLabel = String(query.queryKey[0] ?? "query");
      console.error(`[query:${keyLabel}]`, error);

      toast.error("Couldn't load data", {
        id: `query-error:${keyLabel}`,
        description: errorMessage(error),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isSilent(mutation.meta)) return;

      const keyLabel = mutation.options.mutationKey
        ? String(mutation.options.mutationKey[0] ?? "mutation")
        : "mutation";
      console.error(`[mutation:${keyLabel}]`, error);

      toast.error("Couldn't save changes", {
        id: `mutation-error:${mutation.mutationId}`,
        description: errorMessage(error),
      });
    },
  }),
});
