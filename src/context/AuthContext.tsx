import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { isLocalDevHost } from "@/lib/deployment";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "/api";
const AUTH_MODE_STORAGE_KEY = "automazing-auth-mode";
const LOCAL_USER_ID_STORAGE_KEY = "automazing-local-user-id";
type AuthMode = "cloud" | "local";
const DEBUG_INGEST_URL = "http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  enabled: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Always match the tab you are actually on — avoids Supabase sending users to localhost after deploy. */
function getOAuthRedirectUrl() {
  const path = `${window.location.pathname}${window.location.search}`;
  return `${window.location.origin}${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthModeState] = useState<AuthMode>(() => {
    const allowLocal = isLocalDevHost();
    const stored = (localStorage.getItem(AUTH_MODE_STORAGE_KEY) || "").trim();
    if (stored === "cloud" || stored === "local") {
      if (stored === "local" && !allowLocal) return "cloud";
      return stored;
    }
    if (supabaseEnabled) return "cloud";
    return allowLocal ? "local" : "cloud";
  });
  const enabled = supabaseEnabled && authMode === "cloud";

  const setAuthMode = useCallback((mode: AuthMode) => {
    if (mode === "local" && !isLocalDevHost()) return;
    setAuthModeState(mode);
  }, []);

  useEffect(() => {
    if (!isLocalDevHost() && authMode === "local") {
      setAuthModeState("cloud");
    }
  }, [authMode]);

  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch(DEBUG_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9f37ed" },
      body: JSON.stringify({
        sessionId: "9f37ed",
        runId,
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  };

  const getOrCreateLocalUserId = () => {
    const existing = (localStorage.getItem(LOCAL_USER_ID_STORAGE_KEY) || "").trim();
    if (existing.startsWith("local_")) return existing;
    const created = `local_${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(LOCAL_USER_ID_STORAGE_KEY, created);
    return created;
  };

  useEffect(() => {
    if (!enabled || !supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [enabled]);

  useEffect(() => {
    localStorage.setItem(AUTH_MODE_STORAGE_KEY, authMode);
  }, [authMode]);

  useEffect(() => {
    if (!enabled) {
      const localUserId = getOrCreateLocalUserId();
      debugLog("pre-fix", "H1", "AuthContext.tsx:85", "Requesting local session", {
        authMode,
        enabled,
        localUserIdPrefix: localUserId.slice(0, 14),
      });
      void fetch(`${API_BASE}/auth/local-session`, {
        method: "POST",
        credentials: "include",
        headers: {
          "x-local-user-id": localUserId,
        },
      })
        .then((r) => {
          debugLog("pre-fix", "H1", "AuthContext.tsx:97", "Local session response", {
            status: r.status,
            ok: r.ok,
          });
        })
        .catch((error: unknown) => {
          debugLog("pre-fix", "H1", "AuthContext.tsx:103", "Local session request failed", {
            error: error instanceof Error ? error.message : "unknown_error",
          });
        });
      return;
    }
    if (!session?.access_token) {
      void fetch(`${API_BASE}/auth/session`, {
        method: "DELETE",
        credentials: "include",
      }).catch(() => {
        // Ignore session cleanup failures
      });
      return;
    }
    void fetch(`${API_BASE}/auth/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      credentials: "include",
    }).catch(() => {
      // Ignore sync failures; UI session remains source-of-truth
    });
  }, [enabled, session?.access_token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: enabled ? (session?.user ?? null) : null,
      session: enabled ? session : null,
      loading,
      authMode,
      setAuthMode,
      enabled,
      signInWithGoogle: async () => {
        if (!supabase) return;
        setAuthMode("cloud");
        debugLog("pre-fix", "H2", "AuthContext.tsx:140", "Starting Supabase Google sign-in", {
          enabled,
          hasSupabase: Boolean(supabase),
          locationPath: window.location.pathname,
          oauthRedirect: getOAuthRedirectUrl(),
        });
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: getOAuthRedirectUrl(),
          },
        });
      },
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut();
        }
        await fetch(`${API_BASE}/auth/session`, { method: "DELETE", credentials: "include" }).catch(() => {
          // Ignore session cleanup failures
        });
      },
    }),
    [authMode, enabled, loading, session, setAuthMode]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

