import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Loader2, Play, RefreshCw, Save, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  fetchAutomationSettings,
  saveAutomationSettings,
  fetchAutoReplyLog,
  runAutomationNow,
  sendAutomationDraft,
  type AutomationSettings,
  type AutoReplyLogEntry,
} from "./automationService";
import { useInvalidatePendingDmDrafts } from "./usePendingDmDrafts";

const STATUS_LABELS: Record<AutoReplyLogEntry["status"], { label: string; className: string }> = {
  drafted: { label: "Utkast", className: "border-amber-500/30 bg-amber-500/10 text-amber-700" },
  sent: { label: "Skickat", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  failed: { label: "Misslyckades", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

/**
 * Per-profile auto-reply automation: settings (on/off, draft vs auto-send,
 * tone/instructions), a manual "run now" trigger, and the audit log of what
 * the automation drafted or sent. Rendered in Preferences for the active
 * business profile.
 */
export function AutomationPanel({ businessProfileId }: { businessProfileId: string }) {
  const { toast } = useToast();
  const invalidatePendingDrafts = useInvalidatePendingDmDrafts();
  const [loading, setLoading] = useState(true);
  const [storeEnabled, setStoreEnabled] = useState(true);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [logEntries, setLogEntries] = useState<AutoReplyLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const payload = await fetchAutoReplyLog(businessProfileId);
      setLogEntries(payload.entries);
    } catch {
      // Log is informational — settings card stays usable without it.
      setLogEntries([]);
    } finally {
      setLogLoading(false);
    }
  }, [businessProfileId]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setDirty(false);
      try {
        const payload = await fetchAutomationSettings(businessProfileId);
        if (ignore) return;
        setStoreEnabled(payload.storeEnabled);
        setSettings(payload.settings);
      } catch (error) {
        if (!ignore) {
          toast({
            title: "Kunde inte ladda automationen",
            description: error instanceof Error ? error.message : "Okänt fel",
            variant: "destructive",
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void load();
    void loadLog();
    return () => {
      ignore = true;
    };
  }, [businessProfileId, loadLog, toast]);

  function patchSettings(patch: Partial<AutomationSettings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const payload = await saveAutomationSettings(businessProfileId, settings);
      setSettings(payload.settings);
      setDirty(false);
      toast({
        title: "Automation sparad",
        description: settings.dmAutoReplyEnabled
          ? settings.dmAutoReplyMode === "send"
            ? "AI:n svarar nu automatiskt på nya DM:s för den här profilen."
            : "AI:n skapar nu svarsutkast för nya DM:s (inget skickas automatiskt)."
          : "Auto-svar är avstängt för den här profilen.",
      });
    } catch (error) {
      toast({
        title: "Kunde inte spara",
        description: error instanceof Error ? error.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendDraft(entry: AutoReplyLogEntry) {
    setSendingDraftId(entry.id);
    try {
      await sendAutomationDraft(businessProfileId, entry.id);
      toast({ title: "Svar skickat", description: "Utkastet skickades via Zernio." });
      await loadLog();
      invalidatePendingDrafts(businessProfileId);
    } catch (error) {
      toast({
        title: "Kunde inte skicka utkastet",
        description: error instanceof Error ? error.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setSendingDraftId(null);
    }
  }

  function requestModeChange(mode: AutomationSettings["dmAutoReplyMode"]) {
    if (mode === "send" && settings?.dmAutoReplyMode !== "send") {
      setConfirmSendOpen(true);
      return;
    }
    patchSettings({ dmAutoReplyMode: mode });
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      const payload = await runAutomationNow(businessProfileId);
      const s = payload.summary;
      const blocked = s.note && s.scanned === 0 && s.sent + s.drafted === 0;
      if (blocked) {
        toast({
          title: "Automationen kunde inte läsa inboxen",
          description:
            s.note === "no_zernio_profile_for_tenant"
              ? "Profilen har ingen Zernio-koppling ännu — koppla minst en kanal via Zernio först."
              : s.note,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Automation körd",
          description: `Skannade ${s.scanned} konversationer — ${s.sent} skickade, ${s.drafted} utkast, ${s.failed} misslyckade.${
            s.note ? ` (${s.note})` : ""
          }`,
        });
      }
      await loadLog();
      invalidatePendingDrafts(businessProfileId);
    } catch (error) {
      toast({
        title: "Kunde inte köra automationen",
        description: error instanceof Error ? error.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground pt-2">Laddar automation…</p>;
  }

  if (!storeEnabled || !settings) {
    return (
      <p className="text-sm text-muted-foreground pt-2">
        Automationen kräver att servern har <code className="text-xs mx-1">SUPABASE_SERVICE_ROLE_KEY</code>
        konfigurerad.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Auto-svar på DM:s
          </CardTitle>
          <CardDescription>
            AI:n läser olästa konversationer (Instagram, Facebook, WhatsApp via Zernio) för den här
            profilen och skriver svar. I utkastläge skickas inget — allt hamnar i loggen nedan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="automation-enabled">Aktivera auto-svar</Label>
              <p className="text-xs text-muted-foreground">
                Körs schemalagt på servern och kan triggas manuellt med &quot;Kör nu&quot;.
              </p>
            </div>
            <Switch
              id="automation-enabled"
              checked={settings.dmAutoReplyEnabled}
              onCheckedChange={(checked) => patchSettings({ dmAutoReplyEnabled: checked })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Läge</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  {
                    value: "draft",
                    label: "Utkast (rekommenderas)",
                    desc: "AI:n förbereder svar — du granskar och skickar själv.",
                  },
                  {
                    value: "send",
                    label: "Skicka automatiskt",
                    desc: "AI:n skickar svaret direkt utan granskning.",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => requestModeChange(option.value)}
                  aria-pressed={settings.dmAutoReplyMode === option.value}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    settings.dmAutoReplyMode === option.value
                      ? option.value === "send"
                        ? "border-destructive/60 bg-destructive/5"
                        : "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{option.desc}</span>
                </button>
              ))}
            </div>
            {settings.dmAutoReplyMode === "send" ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <p>
                  Auto-skick är valt — spara för att tillämpa. Då går svar ut utan manuell
                  granskning. Utkastläge är säkrare för de flesta.
                </p>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="automation-tone">Ton</Label>
              <Input
                id="automation-tone"
                value={settings.tone}
                onChange={(e) => patchSettings({ tone: e.target.value })}
                placeholder="warm, professional and concise"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="automation-language">Språk</Label>
              <Input
                id="automation-language"
                value={settings.language}
                onChange={(e) => patchSettings({ language: e.target.value })}
                placeholder="the same language as the message"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation-instructions">Extra instruktioner (valfritt)</Label>
            <Textarea
              id="automation-instructions"
              value={settings.instructions}
              onChange={(e) => patchSettings({ instructions: e.target.value })}
              placeholder="t.ex. Hänvisa bokningsfrågor till bokning@exempel.se, nämn aldrig priser."
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => void handleRunNow()}
              disabled={running || !settings.dmAutoReplyEnabled || dirty}
              title={dirty ? "Spara inställningarna först" : undefined}
            >
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Kör nu
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Spara automation
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30 border-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Automationslogg</CardTitle>
              <CardDescription>Senaste utkast och skickade svar för den här profilen.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadLog()} disabled={logLoading}>
              {logLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {logEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga händelser ännu. När automationen hanterar ett meddelande visas det här.
            </p>
          ) : (
            logEntries.map((entry) => {
              const status = STATUS_LABELS[entry.status] ?? STATUS_LABELS.drafted;
              return (
                <div key={entry.id} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${status.className}`}>
                      {status.label}
                    </span>
                    {entry.platform ? <span className="text-muted-foreground capitalize">{entry.platform}</span> : null}
                    {entry.author_name ? <span className="font-medium">{entry.author_name}</span> : null}
                    <span className="text-muted-foreground ml-auto">
                      {formatRelativeTime(entry.created_at) ?? ""}
                    </span>
                  </div>
                  {entry.incoming_text ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground">Inkommande:</span> {entry.incoming_text}
                    </p>
                  ) : null}
                  {entry.draft_text ? (
                    <p className="text-xs line-clamp-3">
                      <span className="font-medium">Svar:</span> {entry.draft_text}
                    </p>
                  ) : null}
                  {entry.error ? <p className="text-xs text-destructive">{entry.error}</p> : null}
                  {entry.status === "drafted" && entry.kind === "dm" ? (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => void handleSendDraft(entry)}
                        disabled={sendingDraftId === entry.id}
                      >
                        {sendingDraftId === entry.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Skicka svaret
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka DM-svar automatiskt?</AlertDialogTitle>
            <AlertDialogDescription>
              I det här läget skickar AI:n svar direkt till kunder utan att du godkänner dem först.
              Det går inte att ångra ett skickat meddelande. Utkastläge rekommenderas för startups
              och mindre team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                patchSettings({ dmAutoReplyMode: "send" });
                setConfirmSendOpen(false);
              }}
            >
              Ja, aktivera auto-skick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
