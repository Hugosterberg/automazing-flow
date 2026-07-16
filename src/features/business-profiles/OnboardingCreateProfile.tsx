import { useState } from "react";
import { Building2, CalendarDays, CheckCircle2, Loader2, PlugZap, Share2, Star, User } from "lucide-react";
import type { ProfileKind } from "@/types/businessProfile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { saveProfileDocument } from "@/features/profile-documents";
import {
  WORKSPACE_GOAL_DOC_KEY,
  WORKSPACE_GOALS,
  type WorkspaceGoalId,
} from "@/features/onboarding/workspaceGoal";
import { useBusinessProfiles } from "./useBusinessProfiles";
import { useSetActiveBusinessProfileId } from "./useActiveBusinessProfileId";

const FEATURE_STEPS = [
  {
    icon: Share2,
    title: "Koppla sociala konton",
    desc: "Instagram, TikTok, YouTube, Facebook och mer — allt på ett ställe.",
  },
  {
    icon: Star,
    title: "Hantera recensioner",
    desc: "Se och svara på Google Reviews och Tripadvisor direkt i appen.",
  },
  {
    icon: CalendarDays,
    title: "Kalender och e-post",
    desc: "Synka Google Calendar, Outlook och Gmail för en fullständig överblick.",
  },
  {
    icon: PlugZap,
    title: "Allt sparas automatiskt",
    desc: "Dina kopplingar och inställningar sparas och finns kvar nästa gång du loggar in.",
  },
];

/**
 * Shown when a user has zero business profiles. Creates the first one
 * and redirects to /connections so the user can immediately connect accounts.
 */
export function OnboardingCreateProfile() {
  const { user } = useAuth();
  const { createProfile, isCreating } = useBusinessProfiles();
  const setActive = useSetActiveBusinessProfileId();
  const [step, setStep] = useState<"welcome" | "create">("welcome");
  const [kind, setKind] = useState<ProfileKind>("company");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [goalId, setGoalId] = useState<WorkspaceGoalId>("inbox");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !isCreating;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const created = await createProfile({
        name: name.trim(),
        kind,
        company: kind === "company" ? company.trim() || undefined : undefined,
        website: website.trim() || undefined,
      });
      setActive(created.id);
      const goal = WORKSPACE_GOALS.find((g) => g.id === goalId) ?? WORKSPACE_GOALS[0];
      try {
        await saveProfileDocument(
          created.id,
          WORKSPACE_GOAL_DOC_KEY,
          { goalId: goal.id, label: goal.label, setAt: new Date().toISOString() },
          user?.id ?? null
        );
      } catch {
        // Non-blocking — profile exists; goal is optional enrichment.
      }
      // Redirect to /connections via window.location so the full app re-renders
      // with the new active profile set.
      window.location.href = "/connections?wizard=1&next=company";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa företagsprofilen");
    }
  }

  if (step === "welcome") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mx-auto">
              <Building2 className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Välkommen till automazing!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
              Börja med att skapa din första profil — för ett företag eller för ditt privatliv. Sedan kopplar
              du alla dina konton — Instagram, Google, Shopify och mer — på ett och samma ställe.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURE_STEPS.map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span>
              Dina kopplingar sparas automatiskt och finns kvar varje gång du loggar in med ditt Google-konto.
            </span>
          </div>

          <Button className="w-full" size="lg" onClick={() => setStep("create")}>
            Kom igång — skapa din första profil
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
      <form onSubmit={handleSubmit} className="w-full max-w-lg">
        <Card className="border-border/80 shadow-md">
          <CardHeader className="space-y-1 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border mb-1">
              {kind === "personal" ? (
                <User className="h-5 w-5 text-muted-foreground" aria-hidden />
              ) : (
                <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
              )}
            </div>
            <CardTitle className="text-xl">
              {kind === "personal" ? "Berätta om din profil" : "Berätta om ditt företag"}
            </CardTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Den här informationen visas i sidofältet och hjälper AI:n att ge dig mer relevanta förslag.
              Efter koppling: fyll i <strong>beskrivning av verksamheten</strong> under Företag — det gör
              lead-förslag och outreach mycket bättre.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Typ av profil</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "company", label: "Företag", desc: "Varumärke, kund eller verksamhet", icon: Building2 },
                    { value: "personal", label: "Privat", desc: "Dina egna konton och kanaler", icon: User },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setKind(option.value)}
                    aria-pressed={kind === option.value}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                      kind === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <option.icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-name">
                Profilnamn <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bp-name"
                placeholder={
                  kind === "personal" ? "t.ex. Privat eller Mitt namn" : "t.ex. Huvudkontoret eller Restaurang Söder"
                }
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Visas i sidofältet när du väljer aktiv profil.
              </p>
            </div>
            {kind === "company" ? (
              <div className="space-y-1.5">
                <Label htmlFor="bp-company">Företagsnamn (valfritt)</Label>
                <Input
                  id="bp-company"
                  placeholder="Acme AB"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="bp-website">Webbplats (valfritt)</Label>
              <Input
                id="bp-website"
                placeholder="https://acme.se"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Första målet</Label>
              <div className="grid grid-cols-1 gap-2">
                {WORKSPACE_GOALS.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => setGoalId(goal.id)}
                    aria-pressed={goalId === goal.id}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      goalId === goal.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span className="block text-sm font-medium">{goal.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{goal.detail}</span>
                  </button>
                ))}
              </div>
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("welcome")}>
              Tillbaka
            </Button>
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Skapa och koppla konton
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
