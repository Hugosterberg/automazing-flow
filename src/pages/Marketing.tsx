import { useMemo, useState } from "react";
import { m } from "framer-motion";
import { Layers, Loader2, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { buildConnectUrl } from "@/features/connections";
import { MarketingCampaigns, MarketingPerformance, InventoryAdsAlert } from "@/features/marketing";
import { getConnectConfig } from "@/features/connections/connectAuthPath";
import { useTasks } from "@/features/tasks";
import type { TaskRow, TaskStatus } from "@/features/tasks";
import { pageFadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";

const MARKETING_PLATFORMS = [
  { platform: "google_ads" as const, label: "Google Ads" },
  { platform: "meta_business" as const, label: "Meta Business" },
];

const CAMPAIGN_OBJECTIVES = [
  { value: "awareness", label: "Varumärkeskännedom" },
  { value: "traffic", label: "Trafik" },
  { value: "leads", label: "Leads" },
  { value: "sales", label: "Försäljning" },
  { value: "retention", label: "Återköp" },
] as const;

const CAMPAIGN_CHANNELS = [
  { value: "google_search", label: "Google Search" },
  { value: "google_pmax", label: "Google Performance Max" },
  { value: "google_display", label: "Google Display" },
  { value: "meta_social", label: "Meta Facebook/Instagram" },
  { value: "cross_channel", label: "Cross-channel" },
] as const;

function optionLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function optionValue(options: readonly { value: string; label: string }[], label: string | null, fallback: string) {
  if (!label) return fallback;
  return options.find((option) => option.label === label)?.value ?? fallback;
}

function campaignField(description: string | null | undefined, label: string) {
  const prefix = `${label}:`;
  const line = (description || "").split("\n").find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

function buildCampaignDescription(input: {
  objective: string;
  channel: string;
  budget: string;
  startDate: string;
  endDate: string;
  audience: string;
  cta: string;
  notes: string;
}) {
  return [
    `Mål: ${optionLabel(CAMPAIGN_OBJECTIVES, input.objective)}`,
    `Kanal: ${optionLabel(CAMPAIGN_CHANNELS, input.channel)}`,
    input.budget.trim() ? `Budget: ${input.budget.trim()}` : null,
    input.startDate ? `Start: ${input.startDate}` : null,
    input.endDate ? `Slut: ${input.endDate}` : null,
    input.audience.trim() ? `Målgrupp: ${input.audience.trim()}` : null,
    input.cta.trim() ? `CTA: ${input.cta.trim()}` : null,
    input.notes.trim() ? `Anteckningar: ${input.notes.trim().replace(/\s+/g, " ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function dueAtFromDate(date: string) {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}

export default function MarketingPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts } = useAccounts();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { tasks, createTask, updateTask, deleteTask, isDeleting } = useTasks(businessProfileId);

  const campaignTasks = useMemo(
    () => tasks.filter((t) => t.module === "campaign" && t.status !== "archived"),
    [tasks]
  );

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignObjective, setCampaignObjective] = useState("leads");
  const [campaignChannel, setCampaignChannel] = useState("google_search");
  const [campaignBudget, setCampaignBudget] = useState("");
  const [campaignStartDate, setCampaignStartDate] = useState("");
  const [campaignEndDate, setCampaignEndDate] = useState("");
  const [campaignAudience, setCampaignAudience] = useState("");
  const [campaignCta, setCampaignCta] = useState("");
  const [campaignNotes, setCampaignNotes] = useState("");
  const [campaignStatus, setCampaignStatus] = useState<TaskStatus>("open");
  const [campaignSaving, setCampaignSaving] = useState(false);

  function connect(platform: "google_ads" | "meta_business", provider?: "official" | "zernio") {
    if (!businessProfileId) return;
    const config = getConnectConfig(platform);
    if (!config) return;
    window.location.href = buildConnectUrl(config.authPath, businessProfileId, {
      provider: provider ?? config.provider,
      returnTo: "marketing",
    });
  }

  function resetCampaignForm() {
    setEditingCampaignId(null);
    setCampaignTitle("");
    setCampaignObjective("leads");
    setCampaignChannel("google_search");
    setCampaignBudget("");
    setCampaignStartDate("");
    setCampaignEndDate("");
    setCampaignAudience("");
    setCampaignCta("");
    setCampaignNotes("");
    setCampaignStatus("open");
  }

  function openNewCampaign() {
    resetCampaignForm();
    setCampaignOpen(true);
  }

  function openEditCampaign(task: TaskRow) {
    setEditingCampaignId(task.id);
    setCampaignTitle(task.title || "");
    setCampaignObjective(optionValue(CAMPAIGN_OBJECTIVES, campaignField(task.description, "Mål"), "leads"));
    setCampaignChannel(optionValue(CAMPAIGN_CHANNELS, campaignField(task.description, "Kanal"), "google_search"));
    setCampaignBudget(campaignField(task.description, "Budget"));
    setCampaignStartDate(campaignField(task.description, "Start"));
    setCampaignEndDate(campaignField(task.description, "Slut"));
    setCampaignAudience(campaignField(task.description, "Målgrupp"));
    setCampaignCta(campaignField(task.description, "CTA"));
    setCampaignNotes(campaignField(task.description, "Anteckningar") || task.description || "");
    setCampaignStatus(task.status);
    setCampaignOpen(true);
  }

  function handleCampaignDialogChange(open: boolean) {
    setCampaignOpen(open);
    if (!open) resetCampaignForm();
  }

  async function saveCampaign() {
    if (!campaignTitle.trim()) return;
    setCampaignSaving(true);
    const description = buildCampaignDescription({
      objective: campaignObjective,
      channel: campaignChannel,
      budget: campaignBudget,
      startDate: campaignStartDate,
      endDate: campaignEndDate,
      audience: campaignAudience,
      cta: campaignCta,
      notes: campaignNotes,
    });
    try {
      const payload = {
        title: campaignTitle.trim(),
        description,
        priority: "medium" as const,
        status: campaignStatus,
        dueAt: dueAtFromDate(campaignEndDate),
        module: "campaign",
      };
      if (editingCampaignId) {
        await updateTask({ id: editingCampaignId, patch: payload });
      } else {
        await createTask(payload);
      }
      handleCampaignDialogChange(false);
    } finally {
      setCampaignSaving(false);
    }
  }

  async function moveTask(id: string, status: TaskStatus) {
    await updateTask({ id, patch: { status } });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        icon={Megaphone}
        title="Marketing"
        description="Kampanjer, annonskanaler och marknadsföringsflöden."
      />

      <m.div {...pageFadeUp}>
        <SectionConnectionStatus area="marketing" />
      </m.div>

      {oauthErrorDetails ? (
        <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(
              oauthErrorDetails,
              {
                google_ads_not_configured:
                  "Google Ads is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in API settings.",
                meta_business_not_configured:
                  "Meta Business official is not configured. Add META_APP_ID and META_APP_SECRET in API settings.",
                zernio_fetch_failed:
                  "Zernio could not be reached from the local server. For local testing, use Meta official or enable the local Zernio TLS workaround.",
                zernio_connect_failed:
                  "Zernio could not start the marketing connect flow. Check that this platform is supported in your Zernio workspace.",
                zernio_platform_not_supported:
                  "Zernio does not support this marketing platform in your workspace. Use the Official API connection instead.",
                zernio_no_auth_url:
                  "Zernio responded without an auth URL for this marketing platform.",
                zernio_init_failed:
                  "Zernio could not initialize the marketing connect flow. Use Official API, or check ZERNIO_API_KEY/ZERNIO_PROFILE_ID.",
              },
              "Connect failed"
            )}
            onDismiss={clearOauthError}
          />
        </m.div>
      ) : null}

      <m.div {...pageFadeUp} transition={{ delay: 0.04 }} className="grid gap-3 sm:grid-cols-2">
        {MARKETING_PLATFORMS.map((item) => {
          const connected = accounts.some((account) => account.platform === item.platform);
          return (
            <Card key={item.platform} className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.label}</CardTitle>
                <CardDescription>
                  {connected ? "Connected for this profile." : "Connect to bring campaign data into Marketing."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {item.platform === "google_ads" ? (
                  <>
                    <Button
                      size="sm"
                      variant={connected ? "outline" : "default"}
                      onClick={() => connect(item.platform, "official")}
                      disabled={!businessProfileId}
                    >
                      Google official
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => connect(item.platform, "zernio")}
                      disabled={!businessProfileId}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Zernio
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant={connected ? "outline" : "default"}
                    onClick={() => connect(item.platform, "official")}
                    disabled={!businessProfileId}
                  >
                    Meta official
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.045 }}>
        <InventoryAdsAlert />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.05 }}>
        <MarketingPerformance />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.06 }}>
        <MarketingCampaigns />
      </m.div>

      <m.section {...pageFadeUp} transition={{ delay: 0.08 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Kampanjer</h2>
            <p className="text-xs text-muted-foreground">
              Planera, skapa och redigera kampanjer med kanal, mål, budget och period.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openNewCampaign}>
            <Plus className="h-3.5 w-3.5" />
            Ny kampanj
          </Button>
        </div>

        {campaignTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Inga kampanjer ännu</p>
              <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={openNewCampaign}>
                <Plus className="h-3.5 w-3.5" />
                Ny kampanj
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaignTasks.map((task) => (
              <Card key={task.id} className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">{task.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-4 space-y-2">
                  {task.description && (
                    <CardDescription className="text-xs whitespace-pre-line line-clamp-5">
                      {task.description}
                    </CardDescription>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Select value={task.status} onValueChange={(v) => void moveTask(task.id, v as TaskStatus)}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Planerad</SelectItem>
                        <SelectItem value="in_progress">Aktiv</SelectItem>
                        <SelectItem value="blocked">Pausad</SelectItem>
                        <SelectItem value="done">Avslutad</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditCampaign(task)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Redigera kampanj"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTask(task.id)}
                        disabled={isDeleting}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Ta bort kampanj"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </m.section>

      <Dialog open={campaignOpen} onOpenChange={handleCampaignDialogChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCampaignId ? "Redigera kampanj" : "Ny kampanj"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="campaign-title">Kampanjnamn</Label>
              <Input
                id="campaign-title"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mål</Label>
              <Select value={campaignObjective} onValueChange={setCampaignObjective}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_OBJECTIVES.map((objective) => (
                    <SelectItem key={objective.value} value={objective.value}>
                      {objective.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kanal</Label>
              <Select value={campaignChannel} onValueChange={setCampaignChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_CHANNELS.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>
                      {channel.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-budget">Budget</Label>
              <Input
                id="campaign-budget"
                value={campaignBudget}
                onChange={(e) => setCampaignBudget(e.target.value)}
                placeholder="Ex. 5 000 kr/månad"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={campaignStatus} onValueChange={(value) => setCampaignStatus(value as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Planerad</SelectItem>
                  <SelectItem value="in_progress">Aktiv</SelectItem>
                  <SelectItem value="blocked">Pausad</SelectItem>
                  <SelectItem value="done">Avslutad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-start">Start</Label>
              <Input
                id="campaign-start"
                type="date"
                value={campaignStartDate}
                onChange={(e) => setCampaignStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-end">Slut</Label>
              <Input
                id="campaign-end"
                type="date"
                value={campaignEndDate}
                onChange={(e) => setCampaignEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-audience">Målgrupp</Label>
              <Input
                id="campaign-audience"
                value={campaignAudience}
                onChange={(e) => setCampaignAudience(e.target.value)}
                placeholder="Ex. lokala företag, nya kunder"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-cta">CTA</Label>
              <Input
                id="campaign-cta"
                value={campaignCta}
                onChange={(e) => setCampaignCta(e.target.value)}
                placeholder="Ex. Boka demo"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="campaign-notes">Anteckningar</Label>
              <Textarea
                id="campaign-notes"
                value={campaignNotes}
                onChange={(e) => setCampaignNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCampaignDialogChange(false)}>
              Avbryt
            </Button>
            <Button onClick={() => void saveCampaign()} disabled={campaignSaving || !campaignTitle.trim()}>
              {campaignSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCampaignId ? "Spara ändringar" : "Skapa kampanj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
