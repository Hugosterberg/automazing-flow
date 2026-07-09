import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  applyCompanyEnrichmentToForm,
  describeEnrichmentSources,
  enrichCompany,
  summarizeEnrichment,
  type CompanyEnrichment,
} from "./companyEnrichmentClient";
import type { BusinessProfileFormState } from "./businessProfileCompleteness";

type Props = {
  businessProfileId: string | null;
  form: BusinessProfileFormState;
  onApply: (next: BusinessProfileFormState) => void;
  disabled?: boolean;
};

export function CompanyAutoFillCard({ businessProfileId, form, onApply, disabled }: Props) {
  const [orgInput, setOrgInput] = useState(form.orgNumber);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<CompanyEnrichment | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setOrgInput(form.orgNumber);
  }, [form.orgNumber]);

  async function runLookup(includeMcpResearch = false) {
    const orgNumber = orgInput.trim();
    const url = form.website.trim();
    const company = form.company.trim();
    if (!orgNumber && !url && !company) {
      toast.message("Ange org.nr, webbplats eller företagsnamn i formuläret nedan.");
      return;
    }
    setLoading(true);
    try {
      const data = await enrichCompany({
        business_profile_id: businessProfileId,
        orgNumber: orgNumber || undefined,
        url: url || undefined,
        company: company || undefined,
        includeMcpResearch,
      });
      setPreview(data);
      onApply(applyCompanyEnrichmentToForm(form, data));
      const ok = data.sources?.filter((s) => s.status === "success").length ?? 0;
      if (ok === 0) {
        toast.message("Ingen data hittades. Kontrollera org.nr eller att API-nycklar är konfigurerade.");
      } else {
        toast.success(`Fyllde i ${ok} fält automatiskt — granska och spara.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppslag misslyckades.");
    } finally {
      setLoading(false);
    }
  }

  const sourceLines = preview?.sources ? describeEnrichmentSources(preview.sources) : [];
  const summary = preview ? summarizeEnrichment(preview) : null;

  return (
    <Card id="company-auto-fill" className="border-border scroll-mt-24">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Steg 1 · Fyll i automatiskt</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          Ange svenskt org.nr så hämtar vi officiell bolagsdata. Har du webbplats fylls även kontakt och
          beskrivning i om vi hittar dem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="company-org-lookup">Organisationsnummer</Label>
          <div className="flex gap-2">
            <Input
              id="company-org-lookup"
              value={orgInput}
              disabled={disabled || loading}
              placeholder="556016-0680"
              onChange={(e) => setOrgInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runLookup()}
            />
            <Button type="button" disabled={disabled || loading} onClick={() => void runLookup()} className="shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1.5">Hämta</span>
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-0 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform", showAdvanced && "rotate-180")} />
          Fler källor (Google Places, Exa/Sprouts)
        </Button>

        {showAdvanced ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Kräver webbplats eller företagsnamn ifyllt nedan. Exa/Sprouts måste vara kopplade under
              Connections.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || loading}
              onClick={() => void runLookup(true)}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Hämta + marknadsresearch
            </Button>
          </div>
        ) : null}

        {summary ? (
          <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-medium text-foreground">Senast hämtat</p>
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
        ) : null}

        {sourceLines.length > 0 ? (
          <ul className="text-[11px] space-y-1 pt-1 border-t border-border/60">
            {sourceLines.map((line) => (
              <li key={line.id} className="flex gap-2">
                <span className={cn("font-medium min-w-[100px]", line.tone)}>{line.label}</span>
                <span className="text-muted-foreground">{line.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Bolagsverket aktiveras med servernycklar. Google Places kan sättas per profil under Inställningar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** @deprecated Use CompanyAutoFillCard */
export const CompanyRegistryLookup = CompanyAutoFillCard;
