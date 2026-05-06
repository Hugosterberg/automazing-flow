import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, Mail, Shield, Zap, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";
import { storePendingOAuthReturn } from "@/lib/oauthCallbackState";
import { cn } from "@/lib/utils";

const FEATURES = [
  "Koppla alla sociala konton för ett företag på ett ställe",
  "Hantera recensioner från Google och Tripadvisor",
  "Kalender, e-post och innehållshantering samlat",
  "AI-rekommendationer baserade på din faktiska data",
];

type EmailView = "signin" | "signup" | "magic" | "reset" | "check_email";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function EmailLoginForm() {
  const { signInWithEmail, signUpWithEmail, signInWithMagicLink, resetPassword } =
    useAuth();
  const [view, setView] = useState<EmailView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function clearState() {
    setError(null);
    setSuccessMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearState();
    setIsLoading(true);
    try {
      if (view === "signin") {
        await signInWithEmail(email, password);
      } else if (view === "signup") {
        await signUpWithEmail(email, password);
        setView("check_email");
        setSuccessMsg("Kolla din e-post och klicka på bekräftelselänken för att aktivera ditt konto.");
      } else if (view === "magic") {
        await signInWithMagicLink(email);
        setView("check_email");
        setSuccessMsg("En inloggningslänk har skickats till din e-post. Kolla inkorgen.");
      } else if (view === "reset") {
        await resetPassword(email);
        setView("check_email");
        setSuccessMsg("En återställningslänk har skickats till din e-post.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Något gick fel";
      setError(translateAuthError(msg));
    } finally {
      setIsLoading(false);
    }
  }

  if (view === "check_email") {
    return (
      <div className="space-y-4 text-center py-2">
        <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
        <p className="text-sm text-muted-foreground leading-relaxed">{successMsg}</p>
        <Button variant="ghost" size="sm" onClick={() => { setView("signin"); clearState(); }}>
          Tillbaka till inloggning
        </Button>
      </div>
    );
  }

  const needsPassword = view === "signin" || view === "signup";
  const submitLabel =
    view === "signin" ? "Logga in"
      : view === "signup" ? "Skapa konto"
        : view === "magic" ? "Skicka inloggningslänk"
          : "Skicka återställningslänk";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email-input">E-postadress</Label>
        <Input
          id="email-input"
          type="email"
          autoComplete="email"
          placeholder="du@foretag.se"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      {needsPassword && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password-input">Lösenord</Label>
            {view === "signin" && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => { setView("reset"); clearState(); }}
              >
                Glömt lösenordet?
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              id="password-input"
              type={showPassword ? "text" : "password"}
              autoComplete={view === "signup" ? "new-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>

      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground pt-1">
        {view === "signin" && (
          <>
            <button type="button" className="hover:text-foreground" onClick={() => { setView("signup"); clearState(); }}>
              Inget konto? Skapa ett
            </button>
            <span aria-hidden>·</span>
            <button type="button" className="hover:text-foreground" onClick={() => { setView("magic"); clearState(); }}>
              Logga in utan lösenord
            </button>
          </>
        )}
        {view === "signup" && (
          <button type="button" className="hover:text-foreground" onClick={() => { setView("signin"); clearState(); }}>
            Har du redan ett konto? Logga in
          </button>
        )}
        {(view === "magic" || view === "reset") && (
          <button type="button" className="hover:text-foreground" onClick={() => { setView("signin"); clearState(); }}>
            Tillbaka till inloggning
          </button>
        )}
      </div>
    </form>
  );
}

function translateAuthError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Fel e-post eller lösenord.";
  }
  if (lower.includes("email not confirmed")) return "Bekräfta din e-post innan du loggar in.";
  if (lower.includes("user already registered")) return "Det finns redan ett konto med den e-postadressen. Logga in istället.";
  if (lower.includes("password should be at least")) return "Lösenordet måste vara minst 6 tecken.";
  if (lower.includes("rate limit")) return "För många försök. Vänta en stund och försök igen.";
  if (lower.includes("network") || lower.includes("fetch")) return "Nätverksfel — kontrollera din anslutning.";
  return msg;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, enabled, authMode, setAuthMode, signInWithGoogle } = useAuth();
  const allowLocal = isLocalDevHost();
  const [authTab, setAuthTab] = useState<"email" | "google">("email");

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
            <CardTitle className="text-xl">Cloud-inloggning ej tillgänglig</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Supabase-miljövariabler saknas. Lägg till{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> och{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> för att aktivera inloggning.
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
        className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span>Kontrollerar inloggning…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex bg-gradient-to-br from-background via-background to-muted/20">
        {/* Left panel — branding */}
        <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-10 bg-sidebar border-r border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">automazing</span>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold leading-tight text-foreground">
                Allt du behöver.<br />
                På ett ställe.
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                Koppla ihop alla dina sociala konton, hantera kundrecensioner och
                få AI-drivna insikter — allt samlat för ditt företag.
              </p>
            </div>

            <ul className="space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} automazing
          </p>
        </div>

        {/* Right panel — login form */}
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            {/* Mobile logo */}
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold text-foreground">automazing</span>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-foreground">Välkommen</h2>
              <p className="text-sm text-muted-foreground">
                Logga in för att hantera dina konton och kopplingar.
              </p>
            </div>

            {/* Auth tabs */}
            <div className="flex rounded-lg border border-border p-1 gap-1">
              <button
                type="button"
                onClick={() => setAuthTab("email")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  authTab === "email"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Mail className="h-4 w-4" />
                E-post
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("google")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  authTab === "google"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <GoogleIcon className="h-4 w-4" />
                Google
              </button>
            </div>

            {authTab === "email" ? (
              <EmailLoginForm />
            ) : (
              <div className="space-y-3">
                <Button className="w-full gap-2.5" variant="outline" onClick={() => void signInWithGoogle()}>
                  <GoogleIcon className="h-4 w-4" />
                  Fortsätt med Google
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Vi importerar bara ditt namn och din e-postadress.
                </p>
              </div>
            )}

            {allowLocal && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wide">
                    <span className="bg-background px-2 text-muted-foreground">Eller</span>
                  </div>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setAuthMode("local")}>
                  Lokalt läge (ingen inloggning)
                </Button>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  Allt sparas bara i den här webbläsaren.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
