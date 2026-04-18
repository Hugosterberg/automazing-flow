import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBusinessProfiles } from "./useBusinessProfiles";
import { useSetActiveBusinessProfileId } from "./ActiveBusinessProfileContext";

/**
 * Shown when a user has zero business profiles. The new tenant model has no
 * synthetic "default" profile — they must create their first one here.
 */
export function OnboardingCreateProfile() {
  const { createProfile, isCreating } = useBusinessProfiles();
  const setActive = useSetActiveBusinessProfileId();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !isCreating;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const created = await createProfile({
        name: name.trim(),
        company: company.trim() || undefined,
        website: website.trim() || undefined,
      });
      setActive(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create business profile");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
      <form onSubmit={handleSubmit} className="w-full max-w-lg">
        <Card className="border-border/80 shadow-md">
          <CardHeader className="space-y-1 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border mb-1">
              <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle className="text-xl">Create your first business profile</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Each business profile keeps its connected channels, content and context
              separate. You can add more later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="bp-name">Profile name</Label>
              <Input
                id="bp-name"
                placeholder="Acme"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the sidebar switcher and headers.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-company">Company (optional)</Label>
              <Input
                id="bp-company"
                placeholder="Acme AB"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-website">Website (optional)</Label>
              <Input
                id="bp-website"
                placeholder="https://acme.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create business profile
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
