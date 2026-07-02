import type { Profile } from "@/types/accounts";
import { scopedStorageKey } from "@/lib/storageUtils";

/**
 * Workspace mode splits the app into two top-level spaces:
 *
 *   - "private":  the user's personal life (personal profiles, a trimmed nav)
 *   - "business": companies/brands/clients (everything the app offers)
 *
 * The mode is never stored on its own — it is DERIVED from the active
 * profile's `kind` ("personal" → private, anything else → business). Switching
 * mode therefore means switching to a profile of the other kind, which keeps
 * every data hook (all keyed by active profile id) consistent for free.
 */
export type WorkspaceMode = "private" | "business";

/** Profile kinds that belong to the private space. */
export function isPersonalProfile(profile: Pick<Profile, "kind"> | null | undefined): boolean {
  return profile?.kind === "personal";
}

/** Derive the workspace mode from a profile (null → business, the default space). */
export function modeForProfile(profile: Pick<Profile, "kind"> | null | undefined): WorkspaceMode {
  return isPersonalProfile(profile) ? "private" : "business";
}

/** Does this profile belong in the given workspace mode? */
export function profileMatchesMode(profile: Pick<Profile, "kind">, mode: WorkspaceMode): boolean {
  return modeForProfile(profile) === mode;
}

const LAST_PROFILE_PREFIX = "automazing:workspace-last-profile";

function lastProfileKey(mode: WorkspaceMode, userId: string | null | undefined): string {
  return scopedStorageKey(`${LAST_PROFILE_PREFIX}:${mode}`, userId);
}

/** Last active profile id within a mode, so tab switches restore context. */
export function readLastProfileIdForMode(
  mode: WorkspaceMode,
  userId: string | null | undefined
): string | null {
  try {
    const value = localStorage.getItem(lastProfileKey(mode, userId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeLastProfileIdForMode(
  mode: WorkspaceMode,
  userId: string | null | undefined,
  profileId: string
): void {
  try {
    localStorage.setItem(lastProfileKey(mode, userId), profileId);
  } catch {
    // localStorage unavailable — tab switches just fall back to the first
    // profile of the target kind, which is still correct.
  }
}
