import { useEffect, type ReactNode } from "react";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";
import { storePendingOAuthReturn } from "@/lib/oauthCallbackState";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, enabled, authMode, setAuthMode, signInWithGoogle } = useAuth();
  const allowLocal = isLocalDevHost();

  useEffect(() => {
    if (user) return;
    storePendingOAuthReturn(window.location.pathname, window.location.search);
  }, [user]);

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
            <CardTitle className="text-xl">Cloud login unavailable</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              This build does not have Supabase environment variables. Add{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code> (or{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>) to enable Google
              sign-in and synced profiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {allowLocal ? (
              <>
                <Button variant="default" className="w-full" onClick={() => setAuthMode("local")}>
                  Continue in local mode
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Profiles and connected channels stay in this browser. Use the same browser when running OAuth so the
                  server session cookie matches.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure the variables on your host (e.g. Vercel) and redeploy.
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
        className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span>Checking sign-in…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
        <Card className="w-full max-w-md border-border/80 shadow-md">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-xl">Sign in to automazing</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {allowLocal
                ? "Cloud mode syncs profiles with your Google account. Local mode keeps everything on this device only."
                : "Sign in with Google to load and save your profiles."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <Button className="w-full" onClick={() => void signInWithGoogle()}>
              Continue with Google
            </Button>
            {allowLocal ? (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wide">
                    <span className="bg-card px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setAuthMode("local")}>
                  Use local mode (no Google)
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  After connecting channels, stay in the same mode you started with; switching clears the cloud server
                  cookie until you sign in again.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
