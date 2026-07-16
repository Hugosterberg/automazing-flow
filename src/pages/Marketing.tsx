import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { PageAiSuggestionsStrip } from "@/features/ai-recommendations/PageAiSuggestionsStrip";
import { AutomationEnableHint } from "@/features/automation";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { buildConnectUrl } from "@/features/connections";
import {
  MarketingPerformance,
  InventoryAdsAlert,
  CampaignFollowUp,
  MarketingPathsHub,
  MarketingSetupCard,
  useMarketingCampaigns,
  type FollowUpCampaign,
} from "@/features/marketing";
import { formatRoas } from "@/features/marketing/format";
import { stashContentCaption } from "@/lib/contentCaptionHandoff";
import { toast } from "sonner";
import { SalesPlaybookSection } from "@/features/sales-playbook";
import { McpMultiSourceCompare, McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { getConnectConfig, getConnectionPathOptions } from "@/features/connections/connectAuthPath";
import { useTasks } from "@/features/tasks";
import type { TaskRow, TaskStatus } from "@/features/tasks";
import { pageFadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useIsMobile } from "@/hooks/use-mobile";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { cn } from "@/lib/utils";

/** Stable Swedish prefixes for campaign task descriptions (storage format). */
const CAMPAIGN_FIELD = {
  objective: "Mål",
  channel: "Kanal",
  budget: "Budget",
  start: "Start",
  end: "Slut",
  audience: "Målgrupp",
  cta: "CTA",
  notes: "Anteckningar",
} as const;

const CAMPAIGN_OBJECTIVE_VALUES = ["awareness", "traffic", "leads", "sales", "retention"] as const;
const CAMPAIGN_CHANNEL_VALUES = [
  "google_search",
  "google_pmax",
  "google_display",
  "meta_social",
  "social_organic",
  "email_newsletter",
  "seo_content",
  "influencer",
  "marketplace",
  "pr_events",
  "referral",
  "cross_channel",
] as const;

const MARKETING_PLATFORM_IDS = ["google_ads", "meta_business"] as const;

function optionLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function optionValue(options: readonly { value: string; label: string }[], label: string | null, fallback: string) {
  if (!label) return fallback;
  const byLabel = options.find((option) => option.label === label);
  if (byLabel) return byLabel.value;
  const byValue = options.find((option) => option.value === label);
  return byValue?.value ?? fallback;
}

function campaignField(description: string | null | undefined, label: string) {
  const prefix = `${label}:`;
  const line = (description || "").split("\n").find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

function dueAtFromDate(date: string) {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}

export default function MarketingPage() {
  const { t: tPage } = useTranslation("pages");
  const { t } = useTranslation("marketing");
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const activeBp = useActiveBusinessProfileIdOptional();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { activeProfileId, accounts } = useAccounts();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((p) => p.id === businessProfileId);
  const marketingContext = {
    businessName: activeProfile?.name,
    company: activeProfile?.company,
    website: activeProfile?.website,
    email: activeProfile?.email,
    location: activeProfile?.location,
    notes: activeProfile?.notes,
  };

  const { tasks, createTask, updateTask, deleteTask, isDeleting } = useTasks(businessProfileId);
  const { connected, performance, analytics } = useMarketingCampaigns();

  const campaignObjectives = useMemo(
    () => CAMPAIGN_OBJECTIVE_VALUES.map((value) => ({ value, label: t(`objectives.${value}`) })),
    [t],
  );
  const campaignChannels = useMemo(
    () => CAMPAIGN_CHANNEL_VALUES.map((value) => ({ value, label: t(`channels.${value}`) })),
    [t],
  );
  const marketingPlatforms = useMemo(
    () =>
      MARKETING_PLATFORM_IDS.map((platform) => ({
        platform,
        label: t(`platforms.${platform}`),
      })),
    [t],
  );

  const pathStatus = useMemo(() => {
    const status: Record<string, string> = {};
    if (connected.shopify) status.ecommerce = t("pathStatus.shopifyConnected");
    if (analytics?.portfolioGrade && analytics.portfolioGrade !== "—") {
      status["paid-ads"] = t("pathStatus.grade", {
        grade: analytics.portfolioGrade,
        label: analytics.portfolioLabel,
      });
    } else if (performance?.roas != null) {
      status["paid-ads"] = t("pathStatus.roas", { roas: formatRoas(performance.roas) });
    }
    if (connected.meta_business || connected.google_ads) status.social = t("pathStatus.adsConnected");
    return status;
  }, [connected, performance?.roas, analytics?.portfolioGrade, analytics?.portfolioLabel, t]);

  const campaignTasks = useMemo(
    () => tasks.filter((task) => task.module === "campaign" && task.status !== "archived"),
    [tasks]
  );

  const activeCampaigns = useMemo<FollowUpCampaign[]>(
    () =>
      campaignTasks
        .filter((task) => task.status === "in_progress")
        .map((task) => ({
          id: task.id,
          title: task.title || t("campaigns.unnamed"),
          startDate: campaignField(task.description, CAMPAIGN_FIELD.start),
          endDate: campaignField(task.description, CAMPAIGN_FIELD.end),
          budget: campaignField(task.description, CAMPAIGN_FIELD.budget),
          channel: campaignField(task.description, CAMPAIGN_FIELD.channel),
        })),
    [campaignTasks, t],
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
  const [focusedCampaignId, setFocusedCampaignId] = useState<string | null>(null);

  const focusedCampaign = useMemo(
    () => campaignTasks.find((task) => task.id === focusedCampaignId) ?? null,
    [campaignTasks, focusedCampaignId]
  );

  const navigateCampaignRelative = useCallback(
    (delta: 1 | -1) => {
      if (campaignTasks.length === 0) return;
      const currentIndex = focusedCampaignId
        ? campaignTasks.findIndex((task) => task.id === focusedCampaignId)
        : -1;
      const nextIndex =
        currentIndex < 0
          ? delta > 0
            ? 0
            : campaignTasks.length - 1
          : (currentIndex + delta + campaignTasks.length) % campaignTasks.length;
      setFocusedCampaignId(campaignTasks[nextIndex]?.id ?? null);
    },
    [campaignTasks, focusedCampaignId]
  );

  useEffect(() => {
    if (focusedCampaignId && !campaignTasks.some((task) => task.id === focusedCampaignId)) {
      setFocusedCampaignId(null);
    }
  }, [campaignTasks, focusedCampaignId]);

  useEffect(() => {
    if (!focusedCampaignId) return;
    document
      .querySelector(`[data-campaign-id="${focusedCampaignId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedCampaignId, campaignTasks.length]);

  // Deep link from the command palette: /marketing?new=campaign opens the
  // create dialog directly. The param is consumed (removed) so refresh or
  // back navigation doesn't re-open the dialog.
  const [searchParams, setSearchParams] = useSearchParams();

  type MarketingTab = "paths" | "campaigns" | "ads" | "ideas";
  const MARKETING_TAB_VALUES: MarketingTab[] = ["campaigns", "ads", "ideas", "paths"];
  const rawMarketingTab = searchParams.get("tab");
  const marketingTab: MarketingTab =
    rawMarketingTab && (MARKETING_TAB_VALUES as string[]).includes(rawMarketingTab)
      ? (rawMarketingTab as MarketingTab)
      : "campaigns";

  const setMarketingTab = useCallback(
    (tab: MarketingTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === "campaigns") next.delete("tab");
          else next.set("tab", tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (searchParams.get("new") !== "campaign") return;
    setEditingCampaignId(null);
    setCampaignOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.set("tab", "campaigns");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function connect(platform: "google_ads" | "meta_business", provider?: "official" | "zernio") {
    if (!businessProfileId) return;
    const config = getConnectConfig(platform);
    if (!config) return;
    window.location.href = buildConnectUrl(config.authPath, businessProfileId, {
      provider: provider ?? config.provider,
      returnTo: "marketing",
    });
  }

  const resetCampaignForm = useCallback(() => {
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
  }, []);

  const openNewCampaign = useCallback(() => {
    setMarketingTab("campaigns");
    resetCampaignForm();
    setCampaignOpen(true);
  }, [setMarketingTab, resetCampaignForm]);

  const openEditCampaign = useCallback(
    (task: TaskRow) => {
      setEditingCampaignId(task.id);
      setCampaignTitle(task.title || "");
      setCampaignObjective(
        optionValue(campaignObjectives, campaignField(task.description, CAMPAIGN_FIELD.objective), "leads"),
      );
      setCampaignChannel(
        optionValue(campaignChannels, campaignField(task.description, CAMPAIGN_FIELD.channel), "google_search"),
      );
      setCampaignBudget(campaignField(task.description, CAMPAIGN_FIELD.budget));
      setCampaignStartDate(campaignField(task.description, CAMPAIGN_FIELD.start));
      setCampaignEndDate(campaignField(task.description, CAMPAIGN_FIELD.end));
      setCampaignAudience(campaignField(task.description, CAMPAIGN_FIELD.audience));
      setCampaignCta(campaignField(task.description, CAMPAIGN_FIELD.cta));
      const isStructured = Boolean(campaignField(task.description, CAMPAIGN_FIELD.objective));
      setCampaignNotes(
        campaignField(task.description, CAMPAIGN_FIELD.notes) || (isStructured ? "" : task.description || ""),
      );
      setCampaignStatus(task.status);
      setCampaignOpen(true);
    },
    [campaignObjectives, campaignChannels],
  );

  function handleCampaignDialogChange(open: boolean) {
    setCampaignOpen(open);
    if (!open) resetCampaignForm();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (campaignOpen || isTypingTarget(e.target) || isShortcutBlocked()) return;

      if (matchesKey(e, "n") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        openNewCampaign();
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        navigateCampaignRelative(1);
        return;
      }

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        navigateCampaignRelative(-1);
        return;
      }

      if (matchesKey(e, "e") && isPlainLetterShortcut(e) && focusedCampaignId) {
        const task = campaignTasks.find((item) => item.id === focusedCampaignId);
        if (!task) return;
        e.preventDefault();
        openEditCampaign(task);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [campaignOpen, navigateCampaignRelative, focusedCampaignId, campaignTasks, openNewCampaign, openEditCampaign]);

  async function saveCampaign() {
    if (!campaignTitle.trim()) return;
    setCampaignSaving(true);
    const description = [
      `${CAMPAIGN_FIELD.objective}: ${optionLabel(campaignObjectives, campaignObjective)}`,
      `${CAMPAIGN_FIELD.channel}: ${optionLabel(campaignChannels, campaignChannel)}`,
      campaignBudget.trim() ? `${CAMPAIGN_FIELD.budget}: ${campaignBudget.trim()}` : null,
      campaignStartDate ? `${CAMPAIGN_FIELD.start}: ${campaignStartDate}` : null,
      campaignEndDate ? `${CAMPAIGN_FIELD.end}: ${campaignEndDate}` : null,
      campaignAudience.trim() ? `${CAMPAIGN_FIELD.audience}: ${campaignAudience.trim()}` : null,
      campaignCta.trim() ? `${CAMPAIGN_FIELD.cta}: ${campaignCta.trim()}` : null,
      campaignNotes.trim()
        ? `${CAMPAIGN_FIELD.notes}: ${campaignNotes.trim().replace(/\s+/g, " ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
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
        title={tPage("marketing.title")}
        description={tPage("marketing.description")}
      />

      <PageSmartBar
        title={tPage("marketing.smartBar")}
        steps={[tPage("marketing.step1"), tPage("marketing.step2"), tPage("marketing.step3")]}
        tip={tPage("marketing.tip")}
        liveHintOverride={
          activeCampaigns.length > 0
            ? isMobile
              ? tPage("marketing.liveActiveMobile", { count: activeCampaigns.length })
              : tPage("marketing.liveActiveDesktop", { count: activeCampaigns.length })
            : campaignTasks.length > 0
              ? isMobile
                ? tPage("marketing.livePlannedMobile", { count: campaignTasks.length })
                : tPage("marketing.livePlannedDesktop", { count: campaignTasks.length })
              : null
        }
      />

      <PageModeTabs
        value={marketingTab}
        aria-label={t("tabs.ariaLabel")}
        onChange={setMarketingTab}
        options={[
          { value: "campaigns", label: t("tabs.campaigns"), count: campaignTasks.length },
          { value: "ads", label: t("tabs.ads") },
          { value: "ideas", label: t("tabs.ideas") },
          { value: "paths", label: t("tabs.paths") },
        ]}
      />

      {marketingTab === "campaigns" || marketingTab === "ideas" ? (
        <PageAiSuggestionsStrip
          businessProfileId={businessProfileId}
          kinds={["insight", "maintenance"]}
          label={t("aiStrip.label")}
        />
      ) : null}

      {marketingTab === "paths" ? (
      <div className="space-y-4">
        <m.div {...pageFadeUp}>
          <MarketingPathsHub pathStatus={pathStatus} />
        </m.div>
        <m.div {...pageFadeUp} transition={{ delay: 0.02 }}>
          <MarketingSetupCard />
        </m.div>
        <details className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {t("mcp.researchSummary")}
          </summary>
          <div className="mt-3 space-y-4">
            <McpMultiSourceCompare businessProfileId={businessProfileId} />
            <McpFeatureSection
              businessProfileId={businessProfileId}
              featureIds={MCP_PAGE_FEATURE_IDS.marketing}
              title={t("mcp.intelligenceTitle")}
              description={t("mcp.intelligenceDescription")}
            />
          </div>
        </details>
      </div>
      ) : null}

      {marketingTab === "ideas" ? (
      <m.div {...pageFadeUp} transition={{ delay: 0.02 }} id="marketing-ideas" className="space-y-4">
        <SalesPlaybookSection
          businessProfileId={businessProfileId}
          {...marketingContext}
          modes={["channels", "campaigns", "promotions"]}
          defaultMode="channels"
          title={t("ideas.playbookTitle")}
          description={t("ideas.playbookDescription")}
          onUseForCampaign={(item) => {
            stashContentCaption([item.title, item.body].filter(Boolean).join(" — "));
            openNewCampaign();
            toast.success(t("toasts.ideaLoadedCampaign"));
          }}
          onUseForContent={(item) => {
            stashContentCaption([item.title, item.body].filter(Boolean).join("\n\n"));
            navigate("/content?tab=create");
            toast.success(t("toasts.ideaReadyContent"));
          }}
          onOpenEcommerce={() => navigate("/ecommerce")}
        />
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              {t("ideas.contentCardTitle")}
            </CardTitle>
            <CardDescription>{t("ideas.contentCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/content">{t("ideas.openContentIdeas")}</Link>
            </Button>
          </CardContent>
        </Card>
      </m.div>
      ) : null}

      {marketingTab === "paths" || marketingTab === "ads" ? (
      <m.div {...pageFadeUp} transition={{ delay: 0.03 }}>
        <SectionConnectionStatus area="marketing" />
      </m.div>
      ) : null}

      {oauthErrorDetails ? (
        <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(oauthErrorDetails)}
            onDismiss={clearOauthError}
          />
        </m.div>
      ) : null}

      {marketingTab === "ads" ? (
      <>
      <AutomationEnableHint
        compact
        tab="insights"
        focus="marketing-actions"
        title={t("automationHint.title")}
        description={t("automationHint.description")}
        ctaLabel={t("automationHint.cta")}
      />
      <m.section {...pageFadeUp} transition={{ delay: 0.038 }} className="app-workspace-shell !min-h-0 scroll-mt-24 space-y-4 p-3 sm:p-4" id="paid-ads">
        <div className="app-workspace-stats grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("ads.statsCampaigns")}</p>
            <p className="text-xs font-semibold tabular-nums">{campaignTasks.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("ads.statsActive")}</p>
            <p className="text-xs font-semibold tabular-nums">{activeCampaigns.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 col-span-2 sm:col-span-1">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("ads.statsAdvertising")}</p>
            <p className="text-xs font-semibold tabular-nums">
              {marketingPlatforms.filter((item) => accounts.some((a) => a.platform === item.platform)).length}/{marketingPlatforms.length}
            </p>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("ads.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("ads.description")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        {marketingPlatforms.map((item) => {
          const connected = accounts.some((account) => account.platform === item.platform);
          const pathOptions = getConnectionPathOptions(item.platform);
          const defaultPath = pathOptions.find((option) => option.isDefault) ?? pathOptions[0];
          const alternatePath = pathOptions.find((option) => option.id !== defaultPath?.id);
          const defaultProvider =
            defaultPath?.id === "zernio" ? ("zernio" as const) : ("official" as const);
          const alternateProvider =
            alternatePath?.id === "zernio" ? ("zernio" as const) : ("official" as const);
          return (
            <Card key={item.platform} className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.label}</CardTitle>
                <CardDescription>
                  {connected ? t("ads.connected") : t("ads.notConnected")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                {defaultPath ? (
                  <Button
                    size="sm"
                    variant={connected ? "outline" : "default"}
                    onClick={() => connect(item.platform, defaultProvider)}
                    disabled={!businessProfileId}
                    className="gap-1.5"
                  >
                    {defaultProvider === "zernio" ? <Layers className="h-3.5 w-3.5" /> : null}
                    {defaultProvider === "zernio" ? t("ads.connectZernio") : t("ads.connectRecommended")}
                  </Button>
                ) : null}
                {alternatePath ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => connect(item.platform, alternateProvider)}
                    disabled={!businessProfileId}
                  >
                    {alternateProvider === "zernio" ? <Layers className="h-3.5 w-3.5" /> : null}
                    {alternateProvider === "zernio" ? t("ads.connectZernio") : t("ads.useOfficialApi")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
                  <Link to={`/connections?q=${encodeURIComponent(item.label)}`}>
                    {t("ads.connections")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        </div>
      </m.section>

      <m.div {...pageFadeUp} transition={{ delay: 0.045 }}>
        <InventoryAdsAlert />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.05 }}>
        <MarketingPerformance />
      </m.div>
      </>
      ) : null}

      {marketingTab === "campaigns" ? (
      <>
      {activeCampaigns.length > 0 ? (
        <m.div {...pageFadeUp} transition={{ delay: 0.07 }}>
          <CampaignFollowUp
            campaigns={activeCampaigns}
            onUseCampaignCta={(cta, title) => {
              stashContentCaption(`${title}: ${cta}`);
              navigate("/content?tab=publish");
              toast.success(t("toasts.campaignCtaReady"));
            }}
          />
        </m.div>
      ) : null}

      <m.section {...pageFadeUp} transition={{ delay: 0.08 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">{t("campaigns.sectionTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("campaigns.sectionDescription")}</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openNewCampaign}>
            <Plus className="h-3.5 w-3.5" />
            {t("campaigns.newCampaign")}
          </Button>
        </div>

        {campaignTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("campaigns.empty")}</p>
              <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={openNewCampaign}>
                <Plus className="h-3.5 w-3.5" />
                {t("campaigns.newCampaign")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaignTasks.map((task) => (
              <Card
                key={task.id}
                data-campaign-id={task.id}
                className={cn(
                  "border-border",
                  focusedCampaignId === task.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
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
                        <SelectItem value="open">{t("status.open")}</SelectItem>
                        <SelectItem value="in_progress">{t("status.in_progress")}</SelectItem>
                        <SelectItem value="blocked">{t("status.blocked")}</SelectItem>
                        <SelectItem value="done">{t("status.done")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditCampaign(task)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t("campaigns.editAria")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTask(task.id)}
                        disabled={isDeleting}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={t("campaigns.deleteAria")}
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

        {campaignTasks.length > 0 ? (
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm rounded-b-lg mt-3">
            <span className="truncate">
              {focusedCampaign ? (
                <>
                  {t("campaigns.focus")}{" "}
                  <span className="font-medium text-foreground/80">{focusedCampaign.title}</span>
                </>
              ) : (
                t("campaigns.keyboardBrowse")
              )}
            </span>
            <span className="hidden sm:inline">{t("campaigns.keyboardHints")}</span>
          </div>
        ) : null}
      </m.section>
      </>
      ) : null}

      <Dialog open={campaignOpen} onOpenChange={handleCampaignDialogChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCampaignId ? t("campaigns.dialogEditTitle") : t("campaigns.dialogNewTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="campaign-title">{t("campaigns.fieldTitle")}</Label>
              <Input
                id="campaign-title"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("campaigns.fieldObjective")}</Label>
              <Select value={campaignObjective} onValueChange={setCampaignObjective}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campaignObjectives.map((objective) => (
                    <SelectItem key={objective.value} value={objective.value}>
                      {objective.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("campaigns.fieldChannel")}</Label>
              <Select value={campaignChannel} onValueChange={setCampaignChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campaignChannels.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>
                      {channel.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-budget">{t("campaigns.fieldBudget")}</Label>
              <Input
                id="campaign-budget"
                value={campaignBudget}
                onChange={(e) => setCampaignBudget(e.target.value)}
                placeholder={t("campaigns.budgetPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("campaigns.fieldStatus")}</Label>
              <Select value={campaignStatus} onValueChange={(value) => setCampaignStatus(value as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t("status.open")}</SelectItem>
                  <SelectItem value="in_progress">{t("status.in_progress")}</SelectItem>
                  <SelectItem value="blocked">{t("status.blocked")}</SelectItem>
                  <SelectItem value="done">{t("status.done")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-start">{t("campaigns.fieldStart")}</Label>
              <Input
                id="campaign-start"
                type="date"
                value={campaignStartDate}
                onChange={(e) => setCampaignStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-end">{t("campaigns.fieldEnd")}</Label>
              <Input
                id="campaign-end"
                type="date"
                value={campaignEndDate}
                onChange={(e) => setCampaignEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-audience">{t("campaigns.fieldAudience")}</Label>
              <Input
                id="campaign-audience"
                value={campaignAudience}
                onChange={(e) => setCampaignAudience(e.target.value)}
                placeholder={t("campaigns.audiencePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-cta">{t("campaigns.fieldCta")}</Label>
              <Input
                id="campaign-cta"
                value={campaignCta}
                onChange={(e) => setCampaignCta(e.target.value)}
                placeholder={t("campaigns.ctaPlaceholder")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="campaign-notes">{t("campaigns.fieldNotes")}</Label>
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
              {t("campaigns.cancel")}
            </Button>
            <Button onClick={() => void saveCampaign()} disabled={campaignSaving || !campaignTitle.trim()}>
              {campaignSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCampaignId ? t("campaigns.saveChanges") : t("campaigns.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
