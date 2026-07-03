import { useMemo } from "react";
import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { AlertTriangle, Building2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border/60 last:border-0 sm:flex-row sm:items-baseline sm:justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground sm:text-right">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

export default function CompanyPage() {
  const activeBpId = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBpId ?? null;
  const { profiles } = useBusinessProfiles();
  const profile = useMemo(() => profiles.find((p) => p.id === activeBpId) ?? null, [profiles, activeBpId]);
  const websiteUrl = safeWebsiteUrl(profile?.website);
  const hostname = websiteHostname(websiteUrl);
  const { connections } = useConnections(activeBpId);

  const activeConnections = useMemo(
    () => connections.filter((c) => !c.disconnectedAt),
    [connections],
  );

  return (
    <m.div {...pageFadeUp} className="space-y-6 max-w-5xl">
      <PageHeader
        icon={Building2}
        title="Företag"
        description="Allt vi vet om företaget och vart automatiska uppdateringar skickas."
      />

      {/* Company overview */}
      <m.div {...pageFadeUp} transition={{ delay: 0.04 }}>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Företagsinformation</CardTitle>
            <CardDescription>Från den aktiva business-profilen.</CardDescription>
          </CardHeader>
          <CardContent>
            {profile ? (
              <div className="grid gap-x-8 sm:grid-cols-2">
                <InfoRow label="Namn" value={profile.name} />
                <InfoRow label="Typ" value={profile.kind === "personal" ? "Personlig" : "Företag"} />
                <InfoRow label="Företag" value={profile.company} />
                <InfoRow label="Webbplats" value={profile.website} />
                <InfoRow label="Kontakt-e-post" value={profile.email} />
                <InfoRow label="Telefon" value={profile.phone} />
                <InfoRow label="Plats" value={profile.location} />
                <InfoRow label="Anteckningar" value={profile.notes} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">Ingen aktiv profil vald.</p>
            )}
          </CardContent>
        </Card>
      </m.div>

      {/* External MCP intelligence */}
      <m.div {...pageFadeUp} transition={{ delay: 0.05 }} className="space-y-4">
        {!profile?.website ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Ingen webbplats registrerad</AlertTitle>
            <AlertDescription>
              Lägg till webbplatsens URL på{" "}
              <Link to="/connections" className="font-medium underline underline-offset-2 hover:text-foreground">
                Connections
              </Link>{" "}
              för att hämta extern intelligens om företaget.
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

      {/* Connected sources */}
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
                        HEALTH_TONE[c.health] ?? "text-muted-foreground",
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

      {/* Automated updates — same settings card as the Automations page */}
      <m.div {...pageFadeUp} transition={{ delay: 0.08 }}>
        <AutomatedUpdatesCard businessProfileId={activeBpId} fallbackEmail={profile?.email ?? undefined} />
      </m.div>

      {/* System health — config + schema diagnostics */}
      <m.div {...pageFadeUp} transition={{ delay: 0.1 }}>
        <SystemHealthCard />
      </m.div>
    </m.div>
  );
}
