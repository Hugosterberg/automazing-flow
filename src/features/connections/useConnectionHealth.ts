import { useEffect, useRef } from "react";
import { reconcileConnections } from "./zernioClient";

/**
 * Trigger a one-shot reconcile when the page mounts, but throttle per
 * business profile so navigating in and out doesn't hammer Zernio.
 *
 * `onDone` is called (success or error) so callers can refetch their
 * connections query.
 */
export function useAutoReconcile({
  businessProfileId,
  throttleMs = 60_000,
  onDone,
}: {
  businessProfileId: string | null | undefined;
  throttleMs?: number;
  onDone?: (result: { updated?: number; error?: string }) => void;
}) {
  const lastRunRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!businessProfileId) return;
    const last = lastRunRef.current[businessProfileId] ?? 0;
    const now = Date.now();
    if (now - last < throttleMs) return;

    let cancelled = false;
    lastRunRef.current[businessProfileId] = now;

    (async () => {
      try {
        const res = await reconcileConnections(businessProfileId);
        if (!cancelled) onDone?.({ updated: res.updated });
      } catch (e) {
        if (!cancelled) {
          onDone?.({
            error: e instanceof Error ? e.message : "Reconcile failed",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [businessProfileId, throttleMs, onDone]);
}
