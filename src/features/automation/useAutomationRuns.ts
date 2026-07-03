import { useEffect, useState } from "react";
import {
  fetchAutomationRuns,
  type AutomationRunStatus,
} from "./automationService";

export interface AutomationRunsState {
  /** Run status keyed by cron key, for O(1) lookup from catalog entries. */
  byKey: Record<string, AutomationRunStatus>;
  loading: boolean;
  /** Human-readable error message when the fetch failed, else null. */
  error: string | null;
}

/**
 * Loads the per-automation run status (last run + next scheduled run) for the
 * active business profile. Keeps loading/empty/error explicit so the page can
 * render each state without inventing its own fetch logic.
 *
 * Returns an empty map (not an error) when there is no active profile — the
 * schedule cards still render, just without run badges.
 */
export function useAutomationRuns(
  businessProfileId: string | null
): AutomationRunsState {
  const [byKey, setByKey] = useState<Record<string, AutomationRunStatus>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!businessProfileId) {
      setByKey({});
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchAutomationRuns(businessProfileId)
      .then((payload) => {
        if (cancelled) return;
        const next: Record<string, AutomationRunStatus> = {};
        for (const run of payload.runs) next[run.key] = run;
        setByKey(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setByKey({});
        setError(err instanceof Error ? err.message : "Kunde inte hämta körstatus.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessProfileId]);

  return { byKey, loading, error };
}
