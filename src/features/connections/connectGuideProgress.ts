/**
 * ConnectGuide progress is per browser (setup scratchpad), not per tenant.
 * Shared so ConnectSession can mark all steps done after a verified connect.
 */

const STORAGE_PREFIX = "automazing:connect-guide:";

export function readConnectGuideProgress(platform: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${platform}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function writeConnectGuideProgress(platform: string, done: number[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${platform}`, JSON.stringify(done));
  } catch {
    /* private mode / quota — progress is a convenience, never required */
  }
}

/** Mark every guide step complete (e.g. after healthy connect+probe). */
export function markConnectGuideComplete(platform: string, stepCount: number): void {
  if (stepCount <= 0) return;
  writeConnectGuideProgress(
    platform,
    Array.from({ length: stepCount }, (_, i) => i)
  );
}

export function clearConnectGuideProgress(platform: string): void {
  writeConnectGuideProgress(platform, []);
}
