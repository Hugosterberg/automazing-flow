import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import { AlertTriangle, Building2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import {
  BusinessProfileCompletenessCard,
  BusinessProfileEditForm,
  CompanyAutoFillCard,
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

  // Reset the form only when a different profile (or a fresh save) arrives —
  // not on every refetch, which would wipe in-progress edits.
  useEffect(() => {
    setForm(profileToFormState(profile));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (fieldId === "org_number") {
      document.getElementById("company-auto-fill")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFocusField(fieldId);
    document.getElementById(`profile-field-${fieldId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setFocusField(null), 2000);
  }

  async function saveProfile() {
    if (!profile) return;
    try {
      await updateProfile({ id: profile.id, updates: formStateToProfileInput(form) });
      setDirty(false);
      toast.success("Sparat — Sales och outreach använder profilen nästa gång du genererar förslag.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara profilen.");
    }
  }

  return (
    <m.div {...pageFadeUp} className="space-y-6 max-w-3xl pb-8">
      <PageHeader
        icon={Building2}
        title="Företag"
        description="Er bolagsprofil styr AI i Sales, outreach och innehåll. Fyll i automatiskt med org.nr, justera manuellt, spara."
      />

      <PageSmartBar
        title="Bolagsprofilen är grunden — AI använder den för leads, outreach och innehållsförslag."
        steps={[
          "Fyll i automatiskt med org.nr eller börja manuellt",
          "Komplettera beskrivning och målgrupp — det påverkar AI mest",
          "Spara så att Sales och Content får bättre förslag direkt",
        ]}
        tip="Börja med beskrivning (vad ni säljer och till vem), sedan webb och org.nr. Org.nr kan fyllas i automatiskt via uppslag."
        liveHintOverride={
          profile && completeness.percent < 100
            ? `Profilen är ${completeness.percent}% klar — saknas: ${completeness.priorities.map((f) => f.label).join(", ")}`
            : profile
              ? "Profilen ser komplett ut — AI kan ge full träffsäkerhet."
              : null
        }
      />

      {!profile ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Ingen aktiv profil vald. Välj eller skapa en profil först.
          </CardContent>
        </Card>
      ) : (
        <div className="app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4">
          <BusinessProfileCompletenessCard
            profile={profile}
            form={dirty ? form : undefined}
            onFocusField={scrollToField}
          />

          <CompanyAutoFillCard
            businessProfileId={businessProfileId}
            form={form}
            disabled={isUpdating}
            onApply={(next) => {
              setForm(next);
              setDirty(true);
            }}
          />

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Steg 2 · Granska och komplettera</CardTitle>
              <CardDescription>
                {completeness.percent < 50
                  ? "Skriv minst några rader under beskrivning — det påverkar lead-förslagen mest."
                  : "Kontrollera att uppgifterna stämmer innan du sparar."}
              </CardDescription>
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
            </CardContent>
          </Card>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <Button
              type="button"
              size="lg"
              className="shadow-md"
              onClick={() => void saveProfile()}
              disabled={isUpdating || !dirty}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Steg 3 · Spara bolagsprofil
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4 pt-2 border-t border-border/60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Extern analys</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Jämför er domän och position med kopplade research-verktyg (valfritt).
          </p>
        </div>

        {!form.website?.trim() && !profile?.website ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Lägg till webbplats i profilen</AlertTitle>
            <AlertDescription>Behövs för domänuppslag och extern jämförelse nedan.</AlertDescription>
          </Alert>
        ) : null}

        <McpMultiSourceCompare
          businessProfileId={businessProfileId}
          initialSubject={hostname || profile?.company || ""}
        />
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.company}
          title="Domän & konkurrens"
          description="SEO, domäninfo och marknadsresearch via kopplade MCP-leverantörer."
        />
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Anslutna källor ({activeConnections.length})</CardTitle>
          <CardDescription>Plattformar som kan bidra med data om ert bolag.</CardDescription>
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
              Inga anslutningar — börja under Connections.
            </p>
          )}
        </CardContent>
      </Card>

      <AutomatedUpdatesCard businessProfileId={activeBpId} fallbackEmail={profile?.email ?? undefined} />
      <SystemHealthCard />
    </m.div>
  );
}
