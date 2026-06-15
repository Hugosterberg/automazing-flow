import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import { Building2, Mail, BellRing, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { useConnections } from "@/features/connections/useConnections";
import {
  fetchAutomationSettings,
  saveAutomationSettings,
  type AutomationSettings,
} from "@/features/automation";
import { platformLabel } from "@/lib/platformLabels";
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
  const { profiles } = useBusinessProfiles();
  const profile = useMemo(() => profiles.find((p) => p.id === activeBpId) ?? null, [profiles, activeBpId]);
  const { connections } = useConnections(activeBpId);

  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!activeBpId) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAutomationSettings(activeBpId)
      .then((payload) => {
        if (!cancelled) {
          setSettings(payload.settings);
          setDirty(false);
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Kunde inte ladda inställningar.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBpId]);

  function patch(next: Partial<AutomationSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...next } : prev));
    setDirty(true);
  }

  async function save() {
    if (!activeBpId || !settings) return;
    setSaving(true);
    try {
      const payload = await saveAutomationSettings(activeBpId, settings);
      setSettings(payload.settings);
      setDirty(false);
      toast.success("Inställningar sparade");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }

  const activeConnections = useMemo(
    () => connections.filter((c) => !c.disconnectedAt),
    [connections],
  );

  const fallbackEmail = profile?.email?.trim() || "kontots ägar-e-post";

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

      {/* Automated updates */}
      <m.div {...pageFadeUp} transition={{ delay: 0.08 }}>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              Automatiska uppdateringar
            </CardTitle>
            <CardDescription>
              Välj vart uppdateringar mejlas och vilka som skickas. Allt är av tills du slår på det.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Laddar inställningar…
              </div>
            ) : !settings ? (
              <p className="text-sm text-muted-foreground py-2">Välj en aktiv profil för att hantera uppdateringar.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="notification-email" className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> E-post för uppdateringar
                  </Label>
                  <Input
                    id="notification-email"
                    type="email"
                    placeholder={fallbackEmail}
                    value={settings.notificationEmail}
                    onChange={(e) => patch({ notificationEmail: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Lämna tomt för att använda profilens kontakt-e-post ({fallbackEmail}).
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Daglig översikt</p>
                    <p className="text-xs text-muted-foreground">
                      Morgonmejl varje vardag med vad som behöver göras (connections, tasks, rekommendationer).
                    </p>
                  </div>
                  <Switch
                    checked={settings.dailyDigestEnabled}
                    onCheckedChange={(checked) => patch({ dailyDigestEnabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Marknadsförings-larm</p>
                    <p className="text-xs text-muted-foreground">
                      Mejl när ROAS går back (&lt; 1×) eller annonser körs mot tomma hyllor.
                    </p>
                  </div>
                  <Switch
                    checked={settings.marketingAlertsEnabled}
                    onCheckedChange={(checked) => patch({ marketingAlertsEnabled: checked })}
                  />
                </div>

                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Spara
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </m.div>
    </m.div>
  );
}
