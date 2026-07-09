import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import { AlertTriangle, Building2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  BusinessProfileCompletenessCard,
  BusinessProfileEditForm,
  getBusinessProfileCompleteness,
  profileToFormState,
  formStateToProfileInput,
  useActiveBusinessProfileIdOptional,
  useBusinessProfiles,
  type ProfileFieldId,
} from "@/features/business-profiles";
import { useConnections } from "@/features/connections/useConnections";
import { AutomatedUpdatesCard } from "@/features/automation";
import { McpFeatureSection, McpMultiSourceCompare, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { platformLabel } from "@/lib/platformLabels";
import { SystemHealthCard } from "@/features/diagnostics";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

const HEALTH_TONE: Record<string, string> = {
  healthy: "text-success",
  pending: "text-info",
  expired: "text-warning",
  failed: "text-destructive",
  missing: "text-warning",
  disconnected: "text-muted-foreground",
};

function safeWebsiteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function websiteHostname(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function CompanyPage() {
  const activeBpId = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBpId ?? null;
  const { profiles, updateProfile, isUpdating } = useBusinessProfiles();
  const profile = useMemo(() => profiles.find((p) => p.id === activeBpId) ?? null, [profiles, activeBpId]);
  const [form, setForm] = useState(profileToFormState(profile));
  const [focusField, setFocusField] = useState<ProfileFieldId | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(profileToFormState(profile));
    setDirty(false);
  }, [profile?.id, profile?.updatedAt]);

  const completeness = getBusinessProfileCompleteness(profile);
  const websiteUrl = safeWebsiteUrl(form.website || profile?.website);
  const hostname = websiteHostname(websiteUrl);
  const { connections } = useConnections(activeBpId);

  const activeConnections = useMemo(
    () => connections.filter((c) => !c.disconnectedAt),
    [connections]
  );

  function scrollToField(fieldId: ProfileFieldId) {
    setFocusField(fieldId);
    document.getElementById(`profile-field-${fieldId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setFocusField(null), 2000);
  }

  async function saveProfile() {
    if (!profile) return;
    try {
      await updateProfile({ id: profile.id, updates: formStateToProfileInput(form) });
      setDirty(false);
      toast.success("Bolagsprofil sparad — AI-förslag uppdateras nästa gång du använder Sales och outreach.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara profilen.");
    }
  }

  return (
    <m.div {...pageFadeUp} className="space-y-6 max-w-3xl">
      <PageHeader
        icon={Building2}
        title="Företag"
        description="Här fyller du i allt om bolaget. Informationen delas med AI i Sales, outreach, innehåll och automation — ju mer desto bättre."
      />

      {!profile ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Ingen aktiv profil vald. Välj eller skapa en profil först.
          </CardContent>
        </Card>
      ) : (
        <>
          <m.div {...pageFadeUp} transition={{ delay: 0.03 }}>
            <BusinessProfileCompletenessCard profile={profile} form={dirty ? form : undefined} onFocusField={scrollToField} />
          </m.div>

          <m.div {...pageFadeUp} transition={{ delay: 0.04 }}>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Redigera bolagsprofil</CardTitle>
                    <CardDescription>
                      {completeness.percent < 50
                        ? "Börja med beskrivningen — resten kan du fylla i efter hand."
                        : "Spara när du är klar. Du kan alltid komma tillbaka och uppdatera."}
                    </CardDescription>
                  </div>
                  <Button type="button" size="sm" onClick={() => void saveProfile()} disabled={isUpdating || !dirty}>
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Spara
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <BusinessProfileEditForm
                  form={form}
                  disabled={isUpdating}
                  focusFieldId={focusField}
                  onChange={(next) => {
                    setForm(next);
                    setDirty(true);
                  }}
                />
                <div className="mt-6 flex justify-end">
                  <Button type="button" onClick={() => void saveProfile()} disabled={isUpdating || !dirty}>
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Spara bolagsprofil
                  </Button>
                </div>
              </CardContent>
            </Card>
          </m.div>
        </>
      )}

      <m.div {...pageFadeUp} transition={{ delay: 0.05 }} className="space-y-4">
        {!form.website?.trim() && !profile?.website ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Lägg till webbplats ovan</AlertTitle>
            <AlertDescription>
              Med webbadress kan vi hämta extern intelligens om företaget och föreslå bättre prospects.
            </AlertDescription>
          </Alert>
        ) : null}
        <McpMultiSourceCompare
          businessProfileId={businessProfileId}
          initialSubject={hostname || profile?.company || ""}
        />
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.company}
          title="External intelligence"
          description="Domain lookup, SEO overview, and competitive research for this company via connected MCP providers."
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.06 }}>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Anslutna källor ({activeConnections.length})</CardTitle>
            <CardDescription>Plattformar vi hämtar data om företaget från.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeConnections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeConnections.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full bg-current",
                        HEALTH_TONE[c.health] ?? "text-muted-foreground"
                      )}
                      aria-hidden
                    />
                    <span className="font-medium text-foreground">{platformLabel(c.platform)}</span>
                    {c.username ? <span className="text-muted-foreground">· {c.username}</span> : null}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                Inga anslutningar ännu — börja på Connections-sidan.
              </p>
            )}
          </CardContent>
        </Card>
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.08 }}>
        <AutomatedUpdatesCard businessProfileId={activeBpId} fallbackEmail={profile?.email ?? undefined} />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.1 }}>
        <SystemHealthCard />
      </m.div>
    </m.div>
  );
}
