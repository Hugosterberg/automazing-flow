import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Globe2, Loader2, MapPin, Plus, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessProfile } from "@/types/businessProfile";
import {
  fetchLeadSuggestions,
  type LeadSuggestion,
  type LeadSuggestionInput,
} from "./leadSuggestionsClient";
import { getBusinessProfileCompleteness } from "@/features/business-profiles/businessProfileCompleteness";
import type { LeadInput } from "./leadsService";

type Props = {
  businessProfileId: string | null;
  profile?: BusinessProfile | null;
  suggestionInput: LeadSuggestionInput;
  onCreateLead: (input: LeadInput) => Promise<unknown>;
};

export function LeadSuggestionsSection({
  businessProfileId,
  profile,
  suggestionInput,
  onCreateLead,
}: Props) {
  const [suggestions, setSuggestions] = useState<LeadSuggestion[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const autoLoaded = useRef(false);

  const completeness = getBusinessProfileCompleteness(profile);
  const readinessScore = Math.min(4, Math.floor(completeness.percent / 25));

  async function loadSuggestions() {
    if (!businessProfileId) return;
    setLoading(true);
    try {
      const result = await fetchLeadSuggestions(suggestionInput);
      setSuggestions(result.suggestions);
      setSource(result.source);
      if (result.suggestions.length === 0) {
        toast.message("Inga förslag — fyll i mer under Företag och försök igen.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte hämta lead-förslag.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    autoLoaded.current = false;
  }, [businessProfileId, suggestionInput.businessName, suggestionInput.description]);

  useEffect(() => {
    if (!businessProfileId || autoLoaded.current || readinessScore < 2) return;
    autoLoaded.current = true;
    void loadSuggestions();
  }, [businessProfileId, readinessScore, suggestionInput]);

  async function addSuggestion(s: LeadSuggestion) {
    try {
      await onCreateLead({
        company: s.target,
        notes: [s.why, s.how].filter(Boolean).join("\n\n"),
        source: "ai-suggestion",
        status: "new",
      });
      setSuggestions((prev) => prev.filter((x) => x.target !== s.target));
      toast.success("Tillagd som lead");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte lägga till lead.");
    }
  }

  const companyLabel = profile?.company?.trim() || profile?.name?.trim() || "ert bolag";

  return (
    <Card id="lead-suggestions" className="border-primary/25 bg-gradient-to-br from-primary/[0.04] via-background to-background">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Lead-förslag från er profil
            </CardTitle>
            <CardDescription>
              AI föreslår kundsegment som passar {companyLabel} — utifrån vad ni säljer, var ni finns och
              kunder ni redan vunnit.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || !businessProfileId || completeness.percent < 25}
            onClick={() => void loadSuggestions()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {suggestions.length > 0 ? "Uppdatera" : "Föreslå leads"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {companyLabel ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Building2 className="h-3 w-3" />
              {companyLabel}
            </Badge>
          ) : null}
          {profile?.location ? (
            <Badge variant="outline" className="gap-1 font-normal">
              <MapPin className="h-3 w-3" />
              {profile.location}
            </Badge>
          ) : null}
          {profile?.website ? (
            <Badge variant="outline" className="gap-1 font-normal max-w-[220px] truncate">
              <Globe2 className="h-3 w-3 shrink-0" />
              {profile.website.replace(/^https?:\/\//, "")}
            </Badge>
          ) : null}
          {suggestionInput.industry ? (
            <Badge variant="outline" className="font-normal">
              {suggestionInput.industry}
            </Badge>
          ) : null}
          {suggestionInput.sampleCustomers?.length ? (
            <Badge variant="outline" className="font-normal">
              {suggestionInput.sampleCustomers.length} vunna kund
              {suggestionInput.sampleCustomers.length === 1 ? "" : "er"}
            </Badge>
          ) : null}
        </div>

        {!completeness.isStrong ? (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Bättre profil = bättre förslag ({completeness.percent}% klart)
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Gå till{" "}
              <Link to="/company" className="font-medium text-primary underline underline-offset-2">
                Företag
              </Link>{" "}
              och fyll i <strong>beskrivningen</strong> först. Org.nr kan hämtas automatiskt där.
              {completeness.priorities.length > 0 ? (
                <> Saknas: {completeness.priorities.map((f) => f.label.toLowerCase()).join(", ")}.</>
              ) : null}
            </p>
          </div>
        ) : null}

        {loading && suggestions.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyserar er profil…
          </div>
        ) : null}

        {!loading && suggestions.length === 0 && completeness.percent >= 50 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Klicka &quot;Föreslå leads&quot; för att få segment att kontakta.
          </p>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Vem ni kan kontakta{" "}
              {source === "heuristic" ? "· allmänna idéer (ingen AI-nyckel)" : "· anpassat till er profil"}
            </p>
            {suggestions.map((s) => (
              <div
                key={s.target}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{s.target}</p>
                  {s.why ? <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.why}</p> : null}
                  {s.how ? (
                    <p className="text-[11px] text-muted-foreground/90 mt-1">
                      <span className="text-primary/80">Tillvägagångssätt:</span> {s.how}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 h-8"
                  onClick={() => void addSuggestion(s)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Lägg till
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
