import { useContext } from "react";
import { ActiveBusinessProfileContext } from "./activeBusinessProfileContextCore";

/** Returns the active business profile id, or null if none selected yet. */
export function useActiveBusinessProfileIdOptional(): string | null {
  const ctx = useContext(ActiveBusinessProfileContext);
  if (!ctx) {
    throw new Error(
      "useActiveBusinessProfileIdOptional must be used inside ActiveBusinessProfileProvider"
    );
  }
  return ctx.activeBusinessProfileId;
}

/**
 * Hard guard: throws if no active profile is set. Use inside tenant-scoped
 * hooks/components that are always rendered behind <ActiveProfileGuard>.
 */
export function useActiveBusinessProfileId(): string {
  const id = useActiveBusinessProfileIdOptional();
  if (!id) {
    throw new Error(
      "No active business profile. Render this tree behind <ActiveProfileGuard>."
    );
  }
  return id;
}

export function useSetActiveBusinessProfileId(): (id: string | null) => void {
  const ctx = useContext(ActiveBusinessProfileContext);
  if (!ctx) {
    throw new Error(
      "useSetActiveBusinessProfileId must be used inside ActiveBusinessProfileProvider"
    );
  }
  return ctx.setActiveBusinessProfileId;
}
