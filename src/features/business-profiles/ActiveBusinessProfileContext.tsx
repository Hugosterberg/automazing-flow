import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { scopedStorageKey } from "@/lib/storageUtils";
import { ActiveBusinessProfileContext } from "./activeBusinessProfileContextCore";

/**
 * Tenant key for the whole app. Every data-layer hook must consume
 * `useActiveBusinessProfileId()` and pass it into its query key + filter.
 *
 * Persisted per-user in localStorage. The URL param `?bp=<id>` wins when present
 * so that shared links (OAuth callback, Slack-style deeplinks) are deterministic.
 */
const STORAGE_PREFIX = "automazing:active-business-profile";

function storageKey(userId: string | null | undefined): string {
  return scopedStorageKey(STORAGE_PREFIX, userId, null);
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

  return (
    <ActiveBusinessProfileContext.Provider value={value}>
      {children}
    </ActiveBusinessProfileContext.Provider>
  );
}
