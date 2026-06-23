import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  useActiveBusinessProfileIdOptional,
  useSetActiveBusinessProfileId,
} from "./useActiveBusinessProfileId";
import { useBusinessProfiles } from "./useBusinessProfiles";
import { OnboardingCreateProfile } from "./OnboardingCreateProfile";

/**
 * Tenant gate.
 *
 * Behavior:
 * - In local/cloud-disabled mode → passthrough (legacy AccountsContext still owns
 *   profile UX). This keeps the existing app working until Step 10 removes the
 *   legacy fallback.
 * - Cloud + no business profiles  → renders onboarding.
 * - Cloud + has profiles but none active → auto-picks the first and re-renders.
 * - Cloud + active profile exists → renders children.
 */
export function ActiveProfileGuard({ children }: { children: ReactNode }) {
  const { enabled } = useAuth();
  const activeId = useActiveBusinessProfileIdOptional();
  const setActive = useSetActiveBusinessProfileId();
  const { profiles, isLoading } = useBusinessProfiles();

  // Auto-pick the first profile (or clear active if the selected one was deleted).
  useEffect(() => {
    if (!enabled) return;
    if (isLoading) return;
    if (profiles.length === 0) {
      if (activeId) setActive(null);
      return;
    }
    const stillExists = activeId && profiles.some((p) => p.id === activeId);
    if (!stillExists) {
      setActive(profiles[0].id);
    }
  }, [enabled, isLoading, profiles, activeId, setActive]);

  if (!enabled) return <>{children}</>;

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        role="status"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span>Loading your business profiles…</span>
      </div>
    );
  }

  if (profiles.length === 0) {
    return <OnboardingCreateProfile />;
  }

  // We have profiles and activeId will be set by the effect on next render.
  // Until then, render a transient loading state (single frame).
  if (!activeId) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        role="status"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span>Selecting business profile…</span>
      </div>
    );
  }

  return <>{children}</>;
}
