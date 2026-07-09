import { useEffect, type ReactNode } from "react";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LandingPage } from "@/components/landing/LandingPage";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";
import {
  buildAuthReturnPath,
  clearPendingAuthReturn,
  readPendingAuthReturn,
} from "@/lib/authRedirect";
import { storePendingOAuthReturn } from "@/lib/oauthCallbackState";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, enabled, authMode, setAuthMode } = useAuth();
  const allowLocal = isLocalDevHost();

  useEffect(() => {
    if (authMode === "local") return;
    if (user) return;
    storePendingOAuthReturn(window.location.pathname, window.location.search);
  }, [authMode, user]);

  useEffect(() => {
    if (authMode !== "cloud" || !user) return;
    const pendingReturn = readPendingAuthReturn();
    if (!pendingReturn) return;

    clearPendingAuthReturn();
    const current = buildAuthReturnPath({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    if (pendingReturn !== current) {
      window.location.replace(pendingReturn);
    }
  }, [authMode, user]);

  if (authMode === "local") {
    return <>{children}</>;
  }

  if (!enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
        <Card className="w-full max-w-lg border-border/80 shadow-md">
          <CardHeader className="space-y-1 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border mb-1">
              <Shield className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle className="text-xl">Cloud-inloggning ej tillgänglig</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Supabase-miljövariabler saknas. Lägg till{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> och{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>{" "}
              för att aktivera inloggning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {allowLocal ? (
              <>
                <Button variant="default" className="w-full" onClick={() => setAuthMode("local")}>
                  Fortsätt i lokalt läge
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Profiler och kopplade kanaler sparas i den här webbläsaren.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Konfigurera variablerna på din host (t.ex. Vercel) och driftsätt på nytt.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background landing-grid-bg"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" aria-hidden />
        </div>
        <span className="text-sm text-muted-foreground">Kontrollerar inloggning…</span>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return <>{children}</>;
}
