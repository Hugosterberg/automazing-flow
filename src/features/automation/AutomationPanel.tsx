import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

const STATUS_CLASS: Record<AutoReplyLogEntry["status"], string> = {
  drafted: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

/**
 * Per-profile auto-reply automation: settings (on/off, draft vs auto-send,
 * tone/instructions), a manual "run now" trigger, and the audit log of what
 * the automation drafted or sent. Rendered in Preferences for the active
 * business profile.
 */
export function AutomationPanel({ businessProfileId }: { businessProfileId: string }) {
  const { t } = useTranslation("automations");
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

  const statusLabel = (status: AutoReplyLogEntry["status"]) => {
    if (status === "sent") return t("panel.statusSent");
    if (status === "failed") return t("panel.statusFailed");
    return t("panel.statusDrafted");
  };

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
            title: t("panel.toastLoadFailed"),
            description: error instanceof Error ? error.message : t("panel.toastUnknown"),
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
  }, [businessProfileId, loadLog, toast, t]);

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
        title: t("panel.toastSaved"),
        description: settings.dmAutoReplyEnabled
          ? settings.dmAutoReplyMode === "send"
            ? t("panel.toastSavedSend")
            : t("panel.toastSavedDraft")
          : t("panel.toastSavedOff"),
      });
    } catch (error) {
      toast({
        title: t("panel.toastSaveFailed"),
        description: error instanceof Error ? error.message : t("panel.toastUnknown"),
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
      toast({ title: t("panel.toastSent"), description: t("panel.toastSentDesc") });
      await loadLog();
      invalidatePendingDrafts(businessProfileId);
    } catch (error) {
      toast({
        title: t("panel.toastSendFailed"),
        description: error instanceof Error ? error.message : t("panel.toastUnknown"),
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
          title: t("panel.toastInboxBlocked"),
          description:
            s.note === "no_zernio_profile_for_tenant"
              ? t("panel.toastNoZernio")
              : s.note,
          variant: "destructive",
        });
      } else {
        const summary = t("panel.toastRunSummary", {
          scanned: s.scanned,
          sent: s.sent,
          drafted: s.drafted,
          failed: s.failed,
        });
        toast({
          title: t("panel.toastRunOk"),
          description: s.note ? `${summary} (${s.note})` : summary,
        });
      }
      await loadLog();
      invalidatePendingDrafts(businessProfileId);
    } catch (error) {
      toast({
        title: t("panel.toastRunFailed"),
        description: error instanceof Error ? error.message : t("panel.toastUnknown"),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground pt-2">{t("panel.loading")}</p>;
  }

  if (!storeEnabled || !settings) {
    return (
      <p className="text-sm text-muted-foreground pt-2">
        {t("panel.needsServiceRoleBefore")}{" "}
        <code className="text-xs mx-1">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
        {t("panel.needsServiceRoleAfter")}
      </p>
    );
  }

  const modeOptions = [
    {
      value: "draft" as const,
      label: t("panel.modeDraft"),
      desc: t("panel.modeDraftDesc"),
    },
    {
      value: "send" as const,
      label: t("panel.modeSend"),
      desc: t("panel.modeSendDesc"),
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t("panel.title")}
          </CardTitle>
          <CardDescription>{t("panel.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="automation-enabled">{t("panel.enable")}</Label>
              <p className="text-xs text-muted-foreground">{t("panel.enableHint")}</p>
            </div>
            <Switch
              id="automation-enabled"
              checked={settings.dmAutoReplyEnabled}
              onCheckedChange={(checked) => patchSettings({ dmAutoReplyEnabled: checked })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("panel.mode")}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {modeOptions.map((option) => (
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
                <p>{t("panel.modeSendWarning")}</p>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="automation-tone">{t("panel.tone")}</Label>
              <Input
                id="automation-tone"
                value={settings.tone}
                onChange={(e) => patchSettings({ tone: e.target.value })}
                placeholder="warm, professional and concise"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="automation-language">{t("panel.language")}</Label>
              <Input
                id="automation-language"
                value={settings.language}
                onChange={(e) => patchSettings({ language: e.target.value })}
                placeholder="the same language as the message"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation-instructions">{t("panel.instructions")}</Label>
            <Textarea
              id="automation-instructions"
              value={settings.instructions}
              onChange={(e) => patchSettings({ instructions: e.target.value })}
              placeholder={t("panel.instructionsPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => void handleRunNow()}
              disabled={running || !settings.dmAutoReplyEnabled || dirty}
              title={dirty ? t("panel.saveFirst") : undefined}
            >
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {t("panel.runNow")}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {t("panel.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30 border-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t("panel.logTitle")}</CardTitle>
              <CardDescription>{t("panel.logDescription")}</CardDescription>
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
            <p className="text-sm text-muted-foreground">{t("panel.logEmpty")}</p>
          ) : (
            logEntries.map((entry) => {
              const statusClass = STATUS_CLASS[entry.status] ?? STATUS_CLASS.drafted;
              return (
                <div key={entry.id} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${statusClass}`}>
                      {statusLabel(entry.status)}
                    </span>
                    {entry.platform ? <span className="text-muted-foreground capitalize">{entry.platform}</span> : null}
                    {entry.author_name ? <span className="font-medium">{entry.author_name}</span> : null}
                    <span className="text-muted-foreground ml-auto">
                      {formatRelativeTime(entry.created_at) ?? ""}
                    </span>
                  </div>
                  {entry.incoming_text ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground">{t("panel.incoming")}</span>{" "}
                      {entry.incoming_text}
                    </p>
                  ) : null}
                  {entry.draft_text ? (
                    <p className="text-xs line-clamp-3">
                      <span className="font-medium">{t("panel.reply")}</span> {entry.draft_text}
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
                        {t("panel.sendReply")}
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
            <AlertDialogTitle>{t("panel.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("panel.confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("panel.confirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                patchSettings({ dmAutoReplyMode: "send" });
                setConfirmSendOpen(false);
              }}
            >
              {t("panel.confirmEnable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
