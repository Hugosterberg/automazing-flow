import { useCallback, useMemo } from "react";
import { useProfileDocument } from "@/features/profile-documents";
import { useWorkspaceMode } from "@/features/workspace-mode";
import { scopedStorageKey } from "@/lib/storageUtils";
import { useAuth } from "@/context/AuthContext";
import {
  QUICK_NAV_BY_KEY,
  catalogForMode,
  type QuickNavDestination,
} from "./quickNavCatalog";
import {
  QUICK_NAV_PREFS_DOC_KEY,
  buildQuickNavPrefs,
  moreDestinationKeys,
  resolveHomeJumpKeys,
  resolvePrimaryKeys,
  type QuickNavPrefs,
} from "./quickNavPrefs";

const LEGACY_PREFIX = "automazing:quick-nav-prefs";

function readLegacy(businessProfileId: string): QuickNavPrefs | undefined {
  try {
    const raw = localStorage.getItem(`${LEGACY_PREFIX}:${businessProfileId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as QuickNavPrefs;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeLegacy(businessProfileId: string, value: QuickNavPrefs) {
  try {
    localStorage.setItem(`${LEGACY_PREFIX}:${businessProfileId}`, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

/**
 * Per-profile shortcuts for mobile primary tabs + Hem "Gå till".
 */
export function useQuickNavPrefs() {
  const { mode } = useWorkspaceMode();
  const { user } = useAuth();
  const doc = useProfileDocument<QuickNavPrefs>(QUICK_NAV_PREFS_DOC_KEY, {}, {
    legacyRead: (bpId) => readLegacy(bpId) ?? readLegacy(scopedStorageKey("", user?.id, bpId)),
    legacyWrite: writeLegacy,
  });

  const primaryKeys = useMemo(
    () => resolvePrimaryKeys(doc.data, mode),
    [doc.data, mode]
  );
  const homeJumpKeys = useMemo(
    () => resolveHomeJumpKeys(doc.data, mode),
    [doc.data, mode]
  );
  const moreKeys = useMemo(
    () => moreDestinationKeys(primaryKeys, mode),
    [primaryKeys, mode]
  );

  const primaryDestinations = useMemo(
    () => primaryKeys.map((k) => QUICK_NAV_BY_KEY[k]).filter(Boolean) as QuickNavDestination[],
    [primaryKeys]
  );
  const moreDestinations = useMemo(
    () => moreKeys.map((k) => QUICK_NAV_BY_KEY[k]).filter(Boolean) as QuickNavDestination[],
    [moreKeys]
  );
  const homeJumpDestinations = useMemo(
    () => homeJumpKeys.map((k) => QUICK_NAV_BY_KEY[k]).filter(Boolean) as QuickNavDestination[],
    [homeJumpKeys]
  );

  const available = useMemo(() => catalogForMode(mode), [mode]);

  const savePrefs = useCallback(
    (primary: string[], homeJumps: string[]) => {
      doc.save(buildQuickNavPrefs(primary, homeJumps, mode));
    },
    [doc, mode]
  );

  const savePrimary = useCallback(
    (keys: string[]) => {
      savePrefs(keys, homeJumpKeys);
    },
    [savePrefs, homeJumpKeys]
  );

  const saveHomeJumps = useCallback(
    (keys: string[]) => {
      savePrefs(primaryKeys, keys);
    },
    [savePrefs, primaryKeys]
  );

  const resetDefaults = useCallback(() => {
    doc.save({});
  }, [doc]);

  return {
    mode,
    isLoading: doc.isLoading,
    primaryKeys,
    homeJumpKeys,
    primaryDestinations,
    moreDestinations,
    homeJumpDestinations,
    available,
    savePrefs,
    savePrimary,
    saveHomeJumps,
    resetDefaults,
  };
}
