import { useEffect, useState } from "react";
import { BellRing, Loader2, Mail, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchAutomationSettings,
  saveAutomationSettings,
  type AutomationSettings,
} from "./automationService";

/**
 * Settings card for the automated email updates (notification address,
 * daily digest, marketing alerts). Extracted from the Company page so the
 * Automations page can show the exact same controls — both surfaces edit
 * the same `automation_settings` row.
 */
export function AutomatedUpdatesCard({
  businessProfileId,
  fallbackEmail,
}: {
  businessProfileId: string | null;
  /** Shown as placeholder/help when no notification email is set. */
  fallbackEmail?: string;
}) {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fallback = fallbackEmail?.trim() || "kontots ägar-e-post";

  useEffect(() => {
    let cancelled = false;
    if (!businessProfileId) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAutomationSettings(businessProfileId)
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
  }, [businessProfileId]);

  function patch(next: Partial<AutomationSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...next } : prev));
    setDirty(true);
  }

  async function save() {
    if (!businessProfileId || !settings) return;
    setSaving(true);
    try {
      const payload = await saveAutomationSettings(businessProfileId, settings);
      setSettings(payload.settings);
      setDirty(false);
      toast.success("Inställningar sparade");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          Automatiska uppdateringar
        </CardTitle>
        <CardDescription>
          Välj vart uppdateringar mejlas. Schema (dagar och körningstider) ställer du in på respektive
          automationskort nedan.
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
                placeholder={fallback}
                value={settings.notificationEmail}
                onChange={(e) => patch({ notificationEmail: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Lämna tomt för att använda profilens kontakt-e-post ({fallback}).
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Daglig översikt</p>
                <p className="text-xs text-muted-foreground">
                  Morgonmejl varje vardag med vad som behöver göras (connections, tasks, rekommendationer).
                  Slår också på veckorapporten på måndagar.
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
  );
}
