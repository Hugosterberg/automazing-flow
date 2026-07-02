import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import {
  modeForProfile,
  profileMatchesMode,
  readLastProfileIdForMode,
  writeLastProfileIdForMode,
  type WorkspaceMode,
} from "./workspaceMode";

/**
 * Default profile names auto-created the first time a tab is opened with no
 * profile of that kind (personal-only users clicking Business, and vice
 * versa). Swedish to match the onboarding copy; rename anytime afterwards.
 */
const DEFAULT_PROFILE_NAMES: Record<WorkspaceMode, string> = {
  private: "Privat",
  business: "Mitt företag",
};

export interface WorkspaceModeState {
  /** Current mode, derived from the active profile's kind. */
  mode: WorkspaceMode;
  /**
   * Switch to the other space. Activates the last-used (or first) profile of
   * the target kind; on the very first switch to a space with no profile of
   * that kind, one is created automatically so the tab always works.
   */
  setMode: (mode: WorkspaceMode) => void;
  /** True while a first-time profile is being created for the target space. */
  switching: boolean;
}

export function useWorkspaceMode(): WorkspaceModeState {
  const { profiles, activeProfile, setActiveProfileId, addProfile } = useAccounts();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [switching, setSwitching] = useState(false);

  const mode = modeForProfile(activeProfile);

  // Remember the active profile per mode so returning to a tab restores the
  // profile you were last working in (e.g. two companies + one personal).
  useEffect(() => {
    if (!activeProfile) return;
    writeLastProfileIdForMode(mode, userId, activeProfile.id);
  }, [mode, userId, activeProfile]);

  const setMode = useCallback(
    (target: WorkspaceMode) => {
      if (target === mode || switching) return;

      const candidates = profiles.filter((p) => profileMatchesMode(p, target));
      const remembered = readLastProfileIdForMode(target, userId);
      const nextProfile =
        candidates.find((p) => p.id === remembered) ?? candidates[0] ?? null;

      if (nextProfile) {
        setActiveProfileId(nextProfile.id);
        return;
      }

      // No profile of the target kind exists yet (e.g. onboarded with only a
      // personal profile, or never opened Private before): create the space's
      // first profile transparently so the tab always works.
      setSwitching(true);
      Promise.resolve(
        addProfile(DEFAULT_PROFILE_NAMES[target], target === "private" ? "personal" : "company")
      )
        .then((created) => setActiveProfileId(created.id))
        .catch((err) => {
          console.warn(`[workspace-mode] Could not create ${target} profile`, err);
        })
        .finally(() => setSwitching(false));
    },
    [mode, switching, profiles, userId, setActiveProfileId, addProfile]
  );

  return useMemo(() => ({ mode, setMode, switching }), [mode, setMode, switching]);
}
