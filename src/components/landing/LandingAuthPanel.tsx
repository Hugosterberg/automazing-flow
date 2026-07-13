import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { isLocalDevHost } from "@/lib/deployment";
import { LANDING_STEPS } from "@/lib/landingContent";
import { cn } from "@/lib/utils";

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

function translateAuthError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Fel e-post eller lösenord.";
  }
  if (lower.includes("email not confirmed")) return "Bekräfta din e-post innan du loggar in.";
  if (lower.includes("user already registered")) {
    return "Det finns redan ett konto med den e-postadressen. Logga in istället.";
  }
  if (lower.includes("password should be at least")) return "Lösenordet måste vara minst 6 tecken.";
  if (lower.includes("rate limit")) return "För många försök. Vänta en stund och försök igen.";
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Nätverksfel — kontrollera din anslutning.";
  }
  return msg;
}

function EmailLoginForm() {
  const { signInWithEmail, signUpWithEmail, signInWithMagicLink, resetPassword } = useAuth();
  const [view, setView] = useState<EmailView>("signup");
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
      <div className="space-y-4 py-2 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
        <p className="text-sm leading-relaxed text-muted-foreground">{successMsg}</p>
        <Button variant="ghost" size="sm" onClick={() => { setView("signin"); clearState(); }}>
          Tillbaka till inloggning
        </Button>
      </div>
    );
  }

  const needsPassword = view === "signin" || view === "signup";
  const submitLabel =
    view === "signin"
      ? "Logga in"
      : view === "signup"
        ? "Skapa konto gratis"
        : view === "magic"
          ? "Skicka inloggningslänk"
          : "Skicka återställningslänk";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="landing-email-input">E-postadress</Label>
        <Input
          id="landing-email-input"
          type="email"
          autoComplete="email"
          placeholder="du@foretag.se"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {needsPassword ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="landing-password-input">Lösenord</Label>
            {view === "signin" ? (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setView("reset");
                  clearState();
                }}
              >
                Glömt lösenordet?
              </button>
            ) : null}
          </div>
          <div className="relative">
            <Input
              id="landing-password-input"
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
      ) : null}

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full glow-sm" disabled={isLoading}>
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {submitLabel}
      </Button>

      <div className="flex flex-wrap justify-center gap-3 pt-1 text-xs text-muted-foreground">
        {view === "signin" ? (
          <>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => {
                setView("signup");
                clearState();
              }}
            >
              Inget konto? Skapa ett
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => {
                setView("magic");
                clearState();
              }}
            >
              Logga in utan lösenord
            </button>
          </>
        ) : null}
        {view === "signup" ? (
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              setView("signin");
              clearState();
            }}
          >
            Har du redan ett konto? Logga in
          </button>
        ) : null}
        {view === "magic" || view === "reset" ? (
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              setView("signin");
              clearState();
            }}
          >
            Tillbaka till inloggning
          </button>
        ) : null}
      </div>
    </form>
  );
}

type LandingAuthPanelProps = {
  className?: string;
  compact?: boolean;
};

export function LandingAuthPanel({ className, compact = false }: LandingAuthPanelProps) {
  const { authMode, setAuthMode, signInWithGoogle } = useAuth();
  const allowLocal = isLocalDevHost();
  const [authTab, setAuthTab] = useState<"email" | "google">("google");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      setGoogleLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Något gick fel";
      setGoogleError(translateAuthError(msg));
      setGoogleLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "landing-premium-card rounded-2xl border border-border/80 bg-card/80 p-5 shadow-xl backdrop-blur-md sm:p-6",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">
          {compact ? "Kom igång" : "Skapa ditt konto"}
        </h2>
        <p className="text-sm text-muted-foreground">Gratis — klart på under en minut.</p>
      </div>

      {!compact ? (
        <ol className="mt-4 flex flex-col gap-2 sm:flex-row" aria-label="Steg för att komma igång">
          {LANDING_STEPS.map((step) => (
            <li
              key={step.step}
              className="flex-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left sm:px-2 sm:py-2 sm:text-center"
            >
              <span className="block font-display text-xs font-bold text-primary">{step.step}</span>
              <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                {step.title}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-5 flex gap-1 rounded-lg border border-border p-1">
        <button
          type="button"
          onClick={() => {
            setAuthTab("google");
            setGoogleError(null);
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            authTab === "google"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <GoogleIcon className="h-4 w-4" />
          Google
        </button>
        <button
          type="button"
          onClick={() => setAuthTab("email")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            authTab === "email"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Mail className="h-4 w-4" />
          E-post
        </button>
      </div>

      <div className="mt-4">
        {authTab === "email" ? (
          <EmailLoginForm />
        ) : (
          <div className="space-y-3">
            <Button
              className="w-full gap-2.5 glow-sm"
              variant="default"
              onClick={() => void handleGoogleSignIn()}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              {googleLoading ? "Öppnar Google…" : "Fortsätt med Google"}
            </Button>
            {googleError ? (
              <p className="text-center text-xs text-destructive" role="alert">
                {googleError}
              </p>
            ) : null}
            <p className="text-center text-xs text-muted-foreground">
              Vi importerar bara ditt namn och din e-postadress.
            </p>
          </div>
        )}
      </div>

      {allowLocal && authMode === "cloud" ? (
        <>
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide">
              <span className="bg-card/80 px-2 text-muted-foreground">Eller</span>
            </div>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => setAuthMode("local")}>
            Lokalt läge (ingen inloggning)
          </Button>
          <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
            Allt sparas bara i den här webbläsaren.
          </p>
        </>
      ) : null}
    </div>
  );
}
