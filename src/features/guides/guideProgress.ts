/**
 * Guide progress is per browser, not per tenant — it is a scratchpad for
 * "where was I in this walkthrough", never data the product depends on.
 * Mirrors the storage shape used by the connect guides so both feel the
 * same when a user ticks steps off.
 */

const STORAGE_PREFIX = "automazing:guide:";

function storageKey(guideId: string): string {
  return `${STORAGE_PREFIX}${guideId}`;
}

export function readGuideProgress(guideId: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(guideId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function writeGuideProgress(guideId: string, done: number[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(guideId), JSON.stringify(done));
  } catch {
    /* private mode / quota — progress is a convenience, never required */
  }
}

export function clearGuideProgress(guideId: string): void {
  writeGuideProgress(guideId, []);
}

/**
 * True once the user has ticked every step. Used to stop nudging people
 * who already know the flow.
 */
export function isGuideComplete(guideId: string, stepCount: number): boolean {
  if (stepCount <= 0) return false;
  return readGuideProgress(guideId).length >= stepCount;
}
