import { useEffect, useRef } from "react";

type Options = {
  /** Skip the first tick on mount (default true). */
  skipInitial?: boolean;
  /** Only run when this is true (default true). */
  enabled?: boolean;
};

/**
 * Run a callback on an interval while the browser tab is visible.
 * Pauses when the user switches away — good for inbox/feed freshness
 * without burning API quota in background tabs.
 */
export function useVisibleIntervalRefetch(
  callback: () => void,
  intervalMs: number,
  { skipInitial = true, enabled = true }: Options = {}
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timer: number | undefined;
    let skipped = skipInitial;

    function tick() {
      if (document.visibilityState !== "visible") return;
      if (skipped) {
        skipped = false;
        return;
      }
      callbackRef.current();
    }

    function schedule() {
      window.clearInterval(timer);
      timer = window.setInterval(tick, intervalMs);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") tick();
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, skipInitial]);
}
