import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  FolderInput,
  ImageIcon,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProfileDocument } from "@/features/profile-documents";
import { saveProfileDocument } from "@/features/profile-documents/profileDocumentsService";
import { useConnections } from "@/features/connections/useConnections";
import {
  useActiveBusinessProfileIdOptional,
  useBusinessProfiles,
} from "@/features/business-profiles";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAutomationSettings,
  saveAutomationSettings,
  type AutomationSettings,
} from "@/features/automation/automationService";
import { defaultScheduleForKey } from "@/lib/profileJobSchedule";
import { DriveFolderPickerDialog } from "./DriveFolderPickerDialog";
import { AutomationEnableHint } from "@/features/automation";

export const INSTAGRAM_DRIVE_QUEUE_DOC_KEY = "instagram-drive-queue";
const CRON_KEY = "instagram-drive-queue";

type CaptionMode = "template" | "brand" | "ai";

type QueueConfig = {
  enabled: boolean;
  driveAccountId: string;
  toPostFolderId: string;
  toPostFolderName?: string;
  postedFolderId: string;
  postedFolderName?: string;
  instagramAccountId: string;
  captionMode: CaptionMode;
  captionTemplate: string;
  includeHashtags: boolean;
  daysAhead: number;
  abTesting: boolean;
  matchShopifyProducts: boolean;
  useVision: boolean;
  lastEnqueuedFileId?: string;
  lastEnqueuedAt?: string;
  lastError?: string | null;
  lastFolderImageCount?: number;
  captionExperiments?: Array<{
    postId: string;
    variants: [string, string];
    selected: 0 | 1;
    at: string;
    productTitle?: string;
  }>;
};

const EMPTY: QueueConfig = {
  enabled: false,
  driveAccountId: "",
  toPostFolderId: "",
  toPostFolderName: "",
  postedFolderId: "",
  postedFolderName: "",
  instagramAccountId: "",
  captionMode: "brand",
  captionTemplate: "{{name}}\n\n{{company}}",
  includeHashtags: true,
  daysAhead: 1,
  abTesting: true,
  matchShopifyProducts: true,
  useVision: true,
};

/** Extract a Drive folder id from a full URL or raw id paste. */
export function parseDriveFolderId(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  const fromUrl = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  return value;
}

function previewCaption(config: QueueConfig, profile: { name?: string; company?: string; website?: string; location?: string; notes?: string }): string {
  const stem = "summer-launch";
  const brand = profile.company || profile.name || "Your brand";
  if (config.captionMode === "template") {
    return config.captionTemplate
      .split("{{name}}").join(stem)
      .split("{{business}}").join(profile.name || brand)
      .split("{{company}}").join(brand)
      .split("{{website}}").join(profile.website || "")
      .split("{{location}}").join(profile.location || "")
      .trim();
  }
  if (config.captionMode === "ai") {
    return `${stem}\n\n${brand}${profile.notes ? `\n${profile.notes.split("\n")[0]?.slice(0, 80)}` : ""}${profile.website ? `\n${profile.website}` : ""}\n\n#smallbusiness #behindthescenes`;
  }
  const lines = [stem, brand];
  if (profile.notes) lines.push(profile.notes.split("\n")[0]?.slice(0, 120) || "");
  else if (profile.location) lines.push(profile.location);
  if (profile.website) lines.push(profile.website);
  let out = lines.filter(Boolean).join("\n");
  if (config.includeHashtags) out += "\n\n#smallbusiness #behindthescenes #entrepreneur #contentcreator";
  return out;
}

/**
 * Daily Instagram posting from a Google Drive to-post folder, with setup guide
 * and brand/AI captions for the active business profile.
 */
export function InstagramDriveQueueCard() {
  const { t } = useTranslation("social");
  const { user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional() ?? null;
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((p) => p.id === businessProfileId);
  const { connections = [] } = useConnections(businessProfileId);
  const doc = useProfileDocument<QueueConfig>(INSTAGRAM_DRIVE_QUEUE_DOC_KEY, EMPTY);

  const [draft, setDraft] = useState<QueueConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [pickerTarget, setPickerTarget] = useState<"toPost" | "posted" | null>(null);
  const config: QueueConfig = {
    ...EMPTY,
    ...doc.data,
    ...(draft ?? {}),
    captionMode: (draft ?? doc.data)?.captionMode || EMPTY.captionMode,
  };
  const dirty = draft != null;

  const driveAccounts = useMemo(
    () => connections.filter((c) => c.platform === "google_drive"),
    [connections]
  );
  const instagramAccounts = useMemo(
    () => connections.filter((c) => c.platform === "instagram"),
    [connections]
  );

  const checklist = [
    {
      id: "drive",
      done: driveAccounts.length > 0,
      label: t("driveQueue.setup.drive"),
      hint: t("driveQueue.setup.driveHint"),
      href: "/connections?session=google_drive",
    },
    {
      id: "instagram",
      done: instagramAccounts.length > 0,
      label: t("driveQueue.setup.instagram"),
      hint: t("driveQueue.setup.instagramHint"),
      href: "/connections?session=instagram",
    },
    {
      id: "folders",
      done: Boolean(config.toPostFolderId && config.postedFolderId),
      label: t("driveQueue.setup.folders"),
      hint: t("driveQueue.setup.foldersHint"),
    },
    {
      id: "company",
      done: Boolean(activeProfile?.name || activeProfile?.company),
      label: t("driveQueue.setup.company"),
      hint: t("driveQueue.setup.companyHint"),
      href: "/company",
    },
  ];
  const setupComplete = checklist.every((s) => s.done);
  const canEnable = setupComplete && Boolean(config.driveAccountId && config.instagramAccountId);

  function update(patch: Partial<QueueConfig>) {
    setDraft({ ...config, ...patch });
  }

  async function syncJobSchedule(enabled: boolean) {
    if (!businessProfileId) return;
    const current = await fetchAutomationSettings(businessProfileId);
    const base = current.settings.jobSchedules[CRON_KEY] ?? defaultScheduleForKey(CRON_KEY);
    if (base.enabled === enabled) return;
    await saveAutomationSettings(businessProfileId, {
      ...(current.settings as AutomationSettings),
      jobSchedules: { [CRON_KEY]: { ...base, enabled } },
    });
  }

  async function handleSave() {
    const next: QueueConfig = {
      ...config,
      toPostFolderId: parseDriveFolderId(config.toPostFolderId),
      postedFolderId: parseDriveFolderId(config.postedFolderId),
      captionTemplate: config.captionTemplate.trim() || EMPTY.captionTemplate,
      captionMode: config.captionMode || "brand",
      includeHashtags: config.includeHashtags !== false,
      daysAhead: Math.min(7, Math.max(1, Number(config.daysAhead) || 1)),
      abTesting: config.abTesting !== false,
      matchShopifyProducts: config.matchShopifyProducts !== false,
      useVision: config.useVision !== false,
      lastError: config.lastError ?? null,
    };
    if (next.enabled) {
      if (!next.driveAccountId || !next.instagramAccountId) {
        toast.error(t("driveQueue.errors.accountsRequired"));
        return;
      }
      if (!next.toPostFolderId || !next.postedFolderId) {
        toast.error(t("driveQueue.errors.foldersRequired"));
        return;
      }
      if (next.toPostFolderId === next.postedFolderId) {
        toast.error(t("driveQueue.errors.foldersDistinct"));
        return;
      }
    }

    setSaving(true);
    try {
      if (!businessProfileId) throw new Error(t("driveQueue.errors.saveFailed"));
      await saveProfileDocument(businessProfileId, INSTAGRAM_DRIVE_QUEUE_DOC_KEY, next, user?.id);
      doc.save(next);
      await syncJobSchedule(next.enabled);
      setDraft(null);
      toast.success(t("driveQueue.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("driveQueue.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const captionPreview = previewCaption(config, {
    name: activeProfile?.name,
    company: activeProfile?.company,
    website: activeProfile?.website,
    location: activeProfile?.location,
    notes: activeProfile?.notes,
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FolderInput className="h-5 w-5" />
          {t("driveQueue.title")}
        </CardTitle>
        <CardDescription>{t("driveQueue.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Collapsible how-it-works */}
        <div className="rounded-md border border-border/60 bg-muted/20">
          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            aria-expanded={guideOpen}
          >
            <span className="text-xs font-medium">{t("driveQueue.guide.title")}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", guideOpen && "rotate-180")} />
          </button>
          {guideOpen ? (
            <div className="space-y-2 border-t border-border/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
              <ol className="list-decimal pl-4 space-y-1">
                <li>{t("driveQueue.guide.step1")}</li>
                <li>{t("driveQueue.guide.step2")}</li>
                <li>{t("driveQueue.guide.step3")}</li>
                <li>{t("driveQueue.guide.step4")}</li>
              </ol>
              <p>{t("driveQueue.icloudNote")}</p>
              <p className="inline-flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{t("driveQueue.guide.trust")}</span>
              </p>
              <blockquote className="rounded-md border border-border/50 bg-background/80 px-2.5 py-2 italic text-foreground/90">
                {t("driveQueue.guide.example")}
              </blockquote>
            </div>
          ) : null}
        </div>

        {/* Setup checklist — always visible until complete */}
        {!setupComplete ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plug className="h-4 w-4 text-primary" />
              {t("driveQueue.setup.title")}
            </div>
            <p className="text-xs text-muted-foreground">{t("driveQueue.setup.description")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {checklist.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-lg border p-3",
                    step.done ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-border" />
                    )}
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{step.hint}</p>
                  {!step.done && step.href ? (
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs w-full">
                      <Link to={step.href}>{t("driveQueue.setup.action")}</Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("driveQueue.reconnectNote")}{" "}
          <Link to="/connections?session=google_drive" className="text-primary underline underline-offset-2">
            {t("driveQueue.reconnectLink")}
          </Link>
        </p>

        <AutomationEnableHint
          tab="content"
          focus="instagram-drive-queue"
          title={t("driveQueue.scheduleHintTitle")}
          description={t("driveQueue.scheduleHint")}
          ctaLabel={t("driveQueue.scheduleCta")}
          compact
        />

        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
          <div>
            <p className="text-sm font-medium">{t("driveQueue.enable")}</p>
            <p className="text-xs text-muted-foreground">{t("driveQueue.enableHint")}</p>
          </div>
          <Switch
            checked={config.enabled}
            disabled={!canEnable && !config.enabled}
            onCheckedChange={(checked) => update({ enabled: checked })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="drive-queue-drive">{t("driveQueue.driveAccount")}</Label>
            <select
              id="drive-queue-drive"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.driveAccountId}
              onChange={(e) => update({ driveAccountId: e.target.value })}
            >
              <option value="">{t("driveQueue.selectAccount")}</option>
              {driveAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username || a.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drive-queue-ig">{t("driveQueue.instagramAccount")}</Label>
            <select
              id="drive-queue-ig"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.instagramAccountId}
              onChange={(e) => update({ instagramAccountId: e.target.value })}
            >
              <option value="">{t("driveQueue.selectAccount")}</option>
              {instagramAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username || a.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("driveQueue.toPostFolder")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t("driveQueue.folderPlaceholder")}
                value={config.toPostFolderName || config.toPostFolderId}
                onChange={(e) => update({ toPostFolderId: e.target.value, toPostFolderName: "" })}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!config.driveAccountId}
                onClick={() => setPickerTarget("toPost")}
              >
                {t("driveQueue.browse")}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("driveQueue.postedFolder")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t("driveQueue.folderPlaceholder")}
                value={config.postedFolderName || config.postedFolderId}
                onChange={(e) => update({ postedFolderId: e.target.value, postedFolderName: "" })}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!config.driveAccountId}
                onClick={() => setPickerTarget("posted")}
              >
                {t("driveQueue.browse")}
              </Button>
            </div>
          </div>
        </div>

        {typeof config.lastFolderImageCount === "number" ? (
          <p className="text-xs text-muted-foreground">
            {t("driveQueue.remainingImages", { count: config.lastFolderImageCount })}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label>{t("driveQueue.captionMode.label")}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["brand", "driveQueue.captionMode.brand"],
              ["ai", "driveQueue.captionMode.ai"],
              ["template", "driveQueue.captionMode.template"],
            ] as const).map(([mode, key]) => (
              <button
                key={mode}
                type="button"
                onClick={() => update({ captionMode: mode })}
                className={cn(
                  "rounded-lg border p-2.5 text-left text-xs transition-colors",
                  config.captionMode === mode
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/30"
                )}
              >
                <span className="font-medium flex items-center gap-1.5">
                  {mode === "ai" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                  {t(`${key}.title`)}
                </span>
                <span className="mt-1 block text-muted-foreground">{t(`${key}.hint`)}</span>
              </button>
            ))}
          </div>
        </div>

        {config.captionMode === "template" ? (
          <div className="space-y-1.5">
            <Label htmlFor="drive-queue-caption">{t("driveQueue.captionTemplate")}</Label>
            <Textarea
              id="drive-queue-caption"
              value={config.captionTemplate}
              onChange={(e) => update({ captionTemplate: e.target.value })}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("driveQueue.captionHint")}</p>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={config.includeHashtags}
            onChange={(e) => update({ includeHashtags: e.target.checked })}
          />
          {t("driveQueue.includeHashtags")}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="drive-queue-days">{t("driveQueue.daysAhead")}</Label>
            <select
              id="drive-queue-days"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.daysAhead}
              onChange={(e) => update({ daysAhead: Number(e.target.value) })}
            >
              {[1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {t("driveQueue.daysAheadOption", { count: n })}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{t("driveQueue.daysAheadHint")}</p>
          </div>
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={config.abTesting}
                onChange={(e) => update({ abTesting: e.target.checked })}
              />
              {t("driveQueue.abTesting")}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={config.matchShopifyProducts}
                onChange={(e) => update({ matchShopifyProducts: e.target.checked })}
              />
              {t("driveQueue.matchShopify")}
            </label>
            {config.captionMode === "ai" ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={config.useVision}
                  onChange={(e) => update({ useVision: e.target.checked })}
                />
                {t("driveQueue.useVision")}
              </label>
            ) : null}
          </div>
        </div>

        {config.captionExperiments && config.captionExperiments[0] ? (
          <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs space-y-1">
            <p className="font-medium text-muted-foreground">{t("driveQueue.lastExperiment")}</p>
            <p className="text-foreground">
              {t("driveQueue.experimentPicked", {
                n: config.captionExperiments[0].selected + 1,
              })}
            </p>
            {config.captionExperiments[0].productTitle ? (
              <p className="text-muted-foreground">
                {t("driveQueue.matchedProduct", {
                  title: config.captionExperiments[0].productTitle,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">{t("driveQueue.previewLabel")}</p>
          <pre className="whitespace-pre-wrap text-xs text-foreground font-sans">{captionPreview}</pre>
          {config.captionMode === "ai" ? (
            <p className="text-[11px] text-muted-foreground">{t("driveQueue.previewAiNote")}</p>
          ) : null}
        </div>

        {(config.lastEnqueuedAt || config.lastError) && (
          <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground space-y-1">
            {config.lastEnqueuedAt ? (
              <p className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                {t("driveQueue.lastEnqueued", {
                  at: config.lastEnqueuedAt.slice(0, 16).replace("T", " "),
                })}
              </p>
            ) : null}
            {config.lastError ? <p className="text-destructive">{config.lastError}</p> : null}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={!dirty || saving}>
            {t("driveQueue.save")}
          </Button>
        </div>
      </CardContent>

      <DriveFolderPickerDialog
        open={pickerTarget != null}
        onOpenChange={(open) => {
          if (!open) setPickerTarget(null);
        }}
        driveAccountId={config.driveAccountId}
        businessProfileId={businessProfileId}
        title={
          pickerTarget === "posted" ? t("driveQueue.postedFolder") : t("driveQueue.toPostFolder")
        }
        onPick={(folder) => {
          if (pickerTarget === "posted") {
            update({
              postedFolderId: folder.id,
              postedFolderName: folder.name,
            });
          } else {
            update({
              toPostFolderId: folder.id,
              toPostFolderName: folder.name,
              lastFolderImageCount: folder.imageCount,
            });
          }
          setPickerTarget(null);
        }}
      />
    </Card>
  );
}
