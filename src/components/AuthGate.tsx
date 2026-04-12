import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, enabled, authMode, setAuthMode, signInWithGoogle } = useAuth();
  const allowLocal = isLocalDevHost();

  if (authMode === "local") {
    return <>{children}</>;
  }

  if (!enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Supabase not configured</CardTitle>
            <CardDescription>
              Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) to enable Google login and cloud-synced profiles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allowLocal ? (
              <Button variant="secondary" className="w-full" onClick={() => setAuthMode("local")}>
                Continue in local mode
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure environment variables in your host (e.g. Vercel) and redeploy.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading authentication...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in to automazing</CardTitle>
            <CardDescription>
              {allowLocal
                ? "Use your Google account to load and save your profiles, or local mode for local-only storage."
                : "Use your Google account to load and save your profiles."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => void signInWithGoogle()}>
              Continue with Google
            </Button>
            {allowLocal ? (
              <Button variant="secondary" className="w-full" onClick={() => setAuthMode("local")}>
                Use local mode (no login)
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

