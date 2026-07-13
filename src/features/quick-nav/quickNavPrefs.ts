import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";
import {
  MAX_HOME_JUMPS,
  MAX_PRIMARY_SHORTCUTS,
  QUICK_NAV_BY_KEY,
  catalogForMode,
  defaultHomeJumpKeys,
  defaultPrimaryKeys,
  destinationAllowedInMode,
} from "./quickNavCatalog";

export const QUICK_NAV_PREFS_DOC_KEY = "quick-nav-prefs";

export type QuickNavPrefs = {
  /**
   * Ordered route keys for bottom primary shortcuts (excluding Hem).
   * Empty / missing → mode defaults.
   */
  primary?: string[];
  /**
   * Ordered route keys for Hem → "Gå till" cards.
   * Empty / missing → defaults.
   */
  homeJumps?: string[];
};

function sanitizeKeys(
  keys: unknown,
  mode: WorkspaceMode,
  max: number
): string[] {
  if (!Array.isArray(keys)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of keys) {
    if (typeof raw !== "string") continue;
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    const dest = QUICK_NAV_BY_KEY[key];
    if (!dest || !destinationAllowedInMode(dest, mode)) continue;
    // drive-library and content both start with /content — allow only one in primary
    if (
      next.some((k) => {
        const a = QUICK_NAV_BY_KEY[k]?.to.split("?")[0];
        const b = dest.to.split("?")[0];
        return a && b && a === b;
      })
    ) {
      continue;
    }
    seen.add(key);
    next.push(key);
    if (next.length >= max) break;
  }
  return next;
}

/** Resolve effective primary keys (always non-empty for a mode). */
export function resolvePrimaryKeys(
  prefs: QuickNavPrefs | null | undefined,
  mode: WorkspaceMode
): string[] {
  const fromPrefs = sanitizeKeys(prefs?.primary, mode, MAX_PRIMARY_SHORTCUTS);
  if (fromPrefs.length > 0) return fromPrefs;
  return defaultPrimaryKeys(mode);
}

/** Resolve home jump keys. */
export function resolveHomeJumpKeys(
  prefs: QuickNavPrefs | null | undefined,
  mode: WorkspaceMode
): string[] {
  const fromPrefs = sanitizeKeys(prefs?.homeJumps, mode, MAX_HOME_JUMPS);
  if (fromPrefs.length > 0) return fromPrefs;
  return defaultHomeJumpKeys(mode);
}

export function buildQuickNavPrefs(
  primary: string[],
  homeJumps: string[],
  mode: WorkspaceMode
): QuickNavPrefs {
  return {
    primary: sanitizeKeys(primary, mode, MAX_PRIMARY_SHORTCUTS),
    homeJumps: sanitizeKeys(homeJumps, mode, MAX_HOME_JUMPS),
  };
}

/** Destinations not currently pinned as primary — shown under Mer. */
export function moreDestinationKeys(primaryKeys: string[], mode: WorkspaceMode): string[] {
  const primarySet = new Set(primaryKeys);
  const primaryPaths = new Set(
    primaryKeys.map((k) => QUICK_NAV_BY_KEY[k]?.to.split("?")[0]).filter(Boolean)
  );
  return catalogForMode(mode)
    .filter((d) => {
      if (primarySet.has(d.key)) return false;
      const path = d.to.split("?")[0];
      if (primaryPaths.has(path)) return false;
      // Prefer content over drive-library duplicate in Mer when neither is primary
      if (d.key === "drive-library") return false;
      return true;
    })
    .map((d) => d.key);
}
