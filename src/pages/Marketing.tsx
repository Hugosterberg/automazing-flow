import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { buildConnectUrl } from "@/features/connections";
import {
  MarketingCampaigns,
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
  { value: "social_organic", label: "Organisk social" },
  { value: "email_newsletter", label: "E-post / nyhetsbrev" },
  { value: "seo_content", label: "SEO & innehåll" },
  { value: "influencer", label: "Influencer / UGC" },
  { value: "marketplace", label: "Marknadsplats / e-handel" },
  { value: "pr_events", label: "PR / event" },
  { value: "referral", label: "Referral / partners" },
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

  const pathStatus = useMemo(() => {
    const status: Record<string, string> = {};
    if (connected.shopify) status.ecommerce = "Shopify connected";
    if (analytics?.portfolioGrade && analytics.portfolioGrade !== "—") {
      status["paid-ads"] = `Betyg ${analytics.portfolioGrade} · ${analytics.portfolioLabel}`;
    } else if (performance?.roas != null) {
      status["paid-ads"] = `ROAS ${formatRoas(performance.roas)}`;
    }
    if (connected.meta_business || connected.google_ads) status.social = "Ads connected";
    return status;
  }, [connected, performance?.roas, analytics?.portfolioGrade, analytics?.portfolioLabel]);

  const campaignTasks = useMemo(
    () => tasks.filter((t) => t.module === "campaign" && t.status !== "archived"),
    [tasks]
  );

  const activeCampaigns = useMemo<FollowUpCampaign[]>(
    () =>
      campaignTasks
        .filter((t) => t.status === "in_progress")
        .map((t) => ({
          id: t.id,
          title: t.title || "Namnlös kampanj",
          startDate: campaignField(t.description, "Start"),
          endDate: campaignField(t.description, "Slut"),
          budget: campaignField(t.description, "Budget"),
          channel: campaignField(t.description, "Kanal"),
        })),
    [campaignTasks]
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
  const MARKETING_TAB_VALUES: MarketingTab[] = ["paths", "campaigns", "ads", "ideas"];
  const rawMarketingTab = searchParams.get("tab");
  const marketingTab: MarketingTab =
    rawMarketingTab && (MARKETING_TAB_VALUES as string[]).includes(rawMarketingTab)
      ? (rawMarketingTab as MarketingTab)
      : "paths";

  function setMarketingTab(tab: MarketingTab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "paths") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (searchParams.get("new") !== "campaign") return;
    setMarketingTab("campaigns");
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
    setMarketingTab("campaigns");
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
    // Fall back to the raw description ONLY for legacy tasks without the
    // structured "Mål:"-lines. For structured descriptions an empty notes
    // field must stay empty — otherwise the whole description would be
    // re-saved inside "Anteckningar:" and duplicate every field on each edit.
    const isStructured = Boolean(campaignField(task.description, "Mål"));
    setCampaignNotes(
      campaignField(task.description, "Anteckningar") || (isStructured ? "" : task.description || "")
    );
    setCampaignStatus(task.status);
    setCampaignOpen(true);
  }

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
        description="Flera vägar att marknadsföra bolaget och produkterna — betalt, organiskt, e-post, e-handel och partnerskap."
      />

      <PageSmartBar
        title="Marketing samlar betald annonsering, kampanjer och AI-idéer — från strategi till publicering."
        steps={[
          "Koppla Google Ads och Meta för live kampanjdata",
          "Skapa kampanjer eller låt AI föreslå kanaler och erbjudanden",
          "Skicka idéer vidare till Content eller E-handel med ett klick",
        ]}
        tip="ROAS och spend syns när annonskonton är kopplade och snapshots körs."
        liveHintOverride={
          activeCampaigns.length > 0
            ? isMobile
              ? `${activeCampaigns.length} aktiv${activeCampaigns.length === 1 ? "" : "a"} kampanj${activeCampaigns.length === 1 ? "" : "er"} — svep eller tryck för att bläddra.`
              : `${activeCampaigns.length} aktiv${activeCampaigns.length === 1 ? "" : "a"} kampanj${activeCampaigns.length === 1 ? "" : "er"} — J/K bläddra, N ny kampanj.`
            : campaignTasks.length > 0
              ? isMobile
                ? `${campaignTasks.length} kampanj${campaignTasks.length === 1 ? "" : "er"} planerade — tryck Ny kampanj.`
                : `${campaignTasks.length} kampanj${campaignTasks.length === 1 ? "" : "er"} planerade — tryck N för ny.`
              : null
        }
      />

      <PageAiSuggestionsStrip
        businessProfileId={businessProfileId}
        kinds={["insight", "maintenance"]}
        label="AI-insikter för marketing"
      />

      <PageModeTabs
        value={marketingTab}
        aria-label="Marketing-flikar"
        onChange={setMarketingTab}
        options={[
          { value: "paths", label: "Vägar" },
          { value: "campaigns", label: "Kampanjer", count: campaignTasks.length },
          { value: "ads", label: "Betald" },
          { value: "ideas", label: "Idéer" },
        ]}
      />

      {marketingTab === "paths" ? (
      <m.div {...pageFadeUp}>
        <MarketingSetupCard />
        <MarketingPathsHub pathStatus={pathStatus} />
      </m.div>
      ) : null}

      {marketingTab === "ideas" ? (
      <m.div {...pageFadeUp} transition={{ delay: 0.02 }} id="marketing-ideas" className="space-y-4">
        <SalesPlaybookSection
          businessProfileId={businessProfileId}
          {...marketingContext}
          modes={["channels", "campaigns", "promotions"]}
          defaultMode="channels"
          title="Marketingidéer"
          description="AI-förslag på kanaler, kampanjer och erbjudanden anpassade till ditt bolag och dina produkter."
          onUseForCampaign={(item) => {
            stashContentCaption([item.title, item.body].filter(Boolean).join(" — "));
            openNewCampaign();
            toast.success("Idé laddad i ny kampanj");
          }}
          onUseForContent={(item) => {
            stashContentCaption([item.title, item.body].filter(Boolean).join("\n\n"));
            navigate("/content?tab=create");
            toast.success("Idé klar i Innehåll");
          }}
          onOpenEcommerce={() => navigate("/ecommerce")}
        />
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Innehåll som attraherar kunder
            </CardTitle>
            <CardDescription>
              Inläggsidéer som värmer upp potentiella köpare finns i Innehåll — sociala inlägg och outreach-vinklar på ett ställe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/content">Öppna innehållsidéer →</Link>
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
      <m.section {...pageFadeUp} transition={{ delay: 0.038 }} className="app-workspace-shell !min-h-0 scroll-mt-24 space-y-4 p-3 sm:p-4" id="paid-ads">
        <div className="app-workspace-stats grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Kampanjer</p>
            <p className="text-xs font-semibold tabular-nums">{campaignTasks.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Aktiva</p>
            <p className="text-xs font-semibold tabular-nums">{activeCampaigns.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 col-span-2 sm:col-span-1">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Annonsering</p>
            <p className="text-xs font-semibold tabular-nums">
              {MARKETING_PLATFORMS.filter((item) => accounts.some((a) => a.platform === item.platform)).length}/{MARKETING_PLATFORMS.length}
            </p>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Betald annonsering</h2>
          <p className="text-xs text-muted-foreground">
            Koppla Google Ads och Meta för att följa spend, ROAS och aktiva kampanjer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        {MARKETING_PLATFORMS.map((item) => {
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
                  {connected ? "Kopplad för denna profil." : "Koppla för att hämta kampanjdata till Marketing."}
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
                    {defaultProvider === "zernio" ? "Koppla via Zernio" : "Koppla (rekommenderat)"}
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
                    {alternateProvider === "zernio" ? "Koppla via Zernio" : "Använd Official API"}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
                  <Link to={`/connections?q=${encodeURIComponent(item.label)}`}>
                    Kopplingar
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

      <m.div {...pageFadeUp} transition={{ delay: 0.048 }}>
        <McpMultiSourceCompare businessProfileId={businessProfileId} />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.049 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.marketing}
          title="MCP-intelligens"
          description="SEO, marknadsföringsdata och konkurrensresearch via kopplade MCP-leverantörer."
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.05 }}>
        <MarketingPerformance />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.06 }}>
        <MarketingCampaigns />
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
              toast.success("Kampanj-CTA klar i Innehåll");
            }}
          />
        </m.div>
      ) : null}

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

        {campaignTasks.length > 0 ? (
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm rounded-b-lg mt-3">
            <span className="truncate">
              {focusedCampaign ? (
                <>
                  Fokus:{" "}
                  <span className="font-medium text-foreground/80">{focusedCampaign.title}</span>
                </>
              ) : (
                "J/K bläddra bland kampanjer"
              )}
            </span>
            <span className="hidden sm:inline">E Edit · N New</span>
          </div>
        ) : null}
      </m.section>
      </>
      ) : null}

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
