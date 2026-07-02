import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import {
  kindForMode,
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

/**
 * Module-level re-entrancy guard for first-time profile creation. The hook is
 * mounted by several components (tabs, palette, sidebar…), each with its own
 * `switching` state — without a shared guard, two surfaces triggering setMode
 * in the same tick could both take the "no profile of this kind" branch and
 * create duplicate default profiles.
 */
let creatingDefaultProfile = false;

export interface WorkspaceModeState {
  /** Current mode, derived from the active profile's kind. */
  mode: WorkspaceMode;
  /**
   * Switch to the other space. Activates the last-used (or first) profile of
   * the target kind; on the very first switch to a space with no profile of
   * that kind, one is created automatically so the tab always works.
   */
  setMode: (mode: WorkspaceMode) => void;
  /** True while this instance is creating a first-time profile. */
  switching: boolean;
}

export function useWorkspaceMode(): WorkspaceModeState {
  const { profiles, activeProfile, setActiveProfileId, addProfile } = useAccounts();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [switching, setSwitching] = useState(false);

  const mode = modeForProfile(activeProfile);
  const activeProfileIdForStorage = activeProfile?.id ?? null;

  // Remember the active profile per mode so returning to a tab restores the
  // profile you were last working in (e.g. two companies + one personal).
  // Keyed on the id (not the object) so profile-list refetches don't re-fire.
  useEffect(() => {
    if (!activeProfileIdForStorage) return;
    writeLastProfileIdForMode(mode, userId, activeProfileIdForStorage);
  }, [mode, userId, activeProfileIdForStorage]);

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
      if (creatingDefaultProfile) return;
      creatingDefaultProfile = true;
      setSwitching(true);
      Promise.resolve(addProfile(DEFAULT_PROFILE_NAMES[target], kindForMode(target)))
        .then((created) => setActiveProfileId(created.id))
        .catch((err) => {
          console.warn(`[workspace-mode] Could not create ${target} profile`, err);
          toast.error(
            target === "private"
              ? "Could not create your private profile. Try again."
              : "Could not create a business profile. Try again."
          );
        })
        .finally(() => {
          creatingDefaultProfile = false;
          setSwitching(false);
        });
    },
    [mode, switching, profiles, userId, setActiveProfileId, addProfile]
  );

  return { mode, setMode, switching };
}
