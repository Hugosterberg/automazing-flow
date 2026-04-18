import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Tenant key for the whole app. Every data-layer hook must consume
 * `useActiveBusinessProfileId()` and pass it into its query key + filter.
 *
 * Persisted per-user in localStorage. The URL param `?bp=<id>` wins when present
 * so that shared links (OAuth callback, Slack-style deeplinks) are deterministic.
 */
const STORAGE_PREFIX = "automazing:active-business-profile";

function storageKey(userId: string | null | undefined): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

function readStored(userId: string | null | undefined): string | null {
  try {
    const value = localStorage.getItem(storageKey(userId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function readUrlOverride(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("bp");
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

interface ActiveBusinessProfileContextValue {
  activeBusinessProfileId: string | null;
  setActiveBusinessProfileId: (id: string | null) => void;
}

const Ctx = createContext<ActiveBusinessProfileContextValue | null>(null);

export function ActiveBusinessProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [activeId, setActiveId] = useState<string | null>(() => {
    return readUrlOverride() ?? readStored(userId);
  });

  // Re-sync when auth user changes (login/logout across tabs).
  useEffect(() => {
    const url = readUrlOverride();
    if (url) {
      setActiveId(url);
      return;
    }
    setActiveId(readStored(userId));
  }, [userId]);

  const persist = useCallback(
    (next: string | null) => {
      try {
        const key = storageKey(userId);
        if (next) localStorage.setItem(key, next);
        else localStorage.removeItem(key);
      } catch {
        // localStorage unavailable; in-memory state still holds it for the session.
      }
    },
    [userId]
  );

  const setActiveBusinessProfileId = useCallback(
    (id: string | null) => {
      setActiveId(id);
      persist(id);
    },
    [persist]
  );

  const value = useMemo(
    () => ({ activeBusinessProfileId: activeId, setActiveBusinessProfileId }),
    [activeId, setActiveBusinessProfileId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the active business profile id, or null if none selected yet. */
export function useActiveBusinessProfileIdOptional(): string | null {
  const ctx = useContext(Ctx);
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
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useSetActiveBusinessProfileId must be used inside ActiveBusinessProfileProvider"
    );
  }
  return ctx.setActiveBusinessProfileId;
}
