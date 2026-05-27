import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { isLocalDevHost } from "@/lib/deployment";
import { getOAuthRedirectUrl } from "@/lib/authRedirect";
import { apiUrl } from "@/lib/apiBase";
const AUTH_MODE_STORAGE_KEY = "automazing-auth-mode";
const LOCAL_USER_ID_STORAGE_KEY = "automazing-local-user-id";
type AuthMode = "cloud" | "local";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  enabled: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ checkEmail: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /** Avoid DELETE /api/auth/session on first paint when session is still null (before getSession resolves). */
  const prevSyncedAccessTokenRef = useRef<string | null>(null);
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
  const accessToken = session?.access_token ?? null;

  const setAuthMode = useCallback((mode: AuthMode) => {
    if (mode === "local" && !isLocalDevHost()) return;
    setAuthModeState(mode);
  }, []);

  useEffect(() => {
    if (!isLocalDevHost() && authMode === "local") {
      setAuthModeState("cloud");
    }
  }, [authMode]);

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
      void fetch(apiUrl("/api/auth/local-session"), {
        method: "POST",
        credentials: "include",
        headers: {
          "x-local-user-id": localUserId,
        },
      }).catch(() => {
        // Local session bootstrap is best-effort; auth flows tolerate a
        // missing session and surface errors via the UI when needed.
      });
      return;
    }
    if (loading) {
      return;
    }

    const token = accessToken;
    const prev = prevSyncedAccessTokenRef.current;

    if (!token) {
      if (prev) {
        void fetch(apiUrl("/api/auth/session"), {
          method: "DELETE",
          credentials: "include",
        }).catch(() => {
          // Ignore session cleanup failures
        });
      }
      prevSyncedAccessTokenRef.current = null;
      return;
    }

    prevSyncedAccessTokenRef.current = token;
    void fetch(apiUrl("/api/auth/session"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    }).catch(() => {
      // Ignore sync failures; UI session remains source-of-truth
    });
  }, [accessToken, authMode, enabled, loading]);

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
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: getOAuthRedirectUrl(),
          },
        });
      },
      signInWithEmail: async (email: string, password: string) => {
        if (!supabase) return;
        setAuthMode("cloud");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUpWithEmail: async (email: string, password: string) => {
        if (!supabase) return;
        setAuthMode("cloud");
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      },
      signInWithMagicLink: async (email: string) => {
        if (!supabase) return { checkEmail: false };
        setAuthMode("cloud");
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: getOAuthRedirectUrl() },
        });
        if (error) throw error;
        return { checkEmail: true };
      },
      resetPassword: async (email: string) => {
        if (!supabase) return;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getOAuthRedirectUrl(),
        });
        if (error) throw error;
      },
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut();
        }
        await fetch(apiUrl("/api/auth/session"), { method: "DELETE", credentials: "include" }).catch(() => {
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
