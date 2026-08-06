import { useCallback, useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import {
  Bell,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  Save,
  Shield,
  Sparkles,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TeamManager } from "@/components/TeamManager";
import { AiSettingsSection } from "@/features/ai-status";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { openWelcomeTour } from "@/features/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { checkApiaiHealth } from "@/features/content/apiaiClient";
import { apiJson } from "@/lib/apiJson";
import { ZernioHelpTab } from "@/features/preferences/ZernioHelpTab";
import { PreferencesDataSection } from "@/features/preferences/PreferencesDataSection";
import { LanguageSettingsSection } from "@/features/preferences/LanguageSettingsSection";
import { QuickNavPrefsEditor } from "@/features/quick-nav";

type GlobalEntry = { key: string; configured: boolean; scope: "global" };

type TenantEntry = {
  key: string;
  label: string;
  description: string;
  inputType: "password" | "text";
  configured: boolean;
  tenantOverride: boolean;
};

type FeatureRequirement = {
  name: string;
  testTarget: string;
};

type ConfigTestResult = {
  ok: boolean;
  missing: string[];
  missingAny: string[][];
  message: string;
  authPath?: string | null;
  label?: string;
};

type IntegrationHelp = {
  title: string;
  setup: string;
  find: string;
  url: string;
};

const featureRequirements: FeatureRequirement[] = [
  { name: "AI analysis", testTarget: "openai" },
  { name: "Zernio social / reviews integrations", testTarget: "zernio" },
  { name: "Canva design export", testTarget: "canva" },
  { name: "Google Drive / Gmail / Calendar / Reviews OAuth", testTarget: "google_drive" },
  { name: "Google Ads OAuth / API", testTarget: "google_ads" },
  { name: "Meta Business OAuth / API", testTarget: "meta_business" },
  { name: "Digital Brand PageSpeed audits", testTarget: "pagespeed" },
  { name: "apiai.me content tools", testTarget: "apiai" },
  { name: "Outlook / Outlook Calendar OAuth", testTarget: "microsoft" },
  { name: "Notion OAuth", testTarget: "notion" },
  { name: "Shopify OAuth", testTarget: "shopify" },
  { name: "Instagram direct fallback", testTarget: "instagram_direct" },
  { name: "TikTok official OAuth", testTarget: "tiktok" },
  { name: "X / Twitter OAuth", testTarget: "x" },
  { name: "Tripadvisor official API", testTarget: "tripadvisor" },
];

const HELP_BY_TARGET: Record<string, IntegrationHelp> = {
  openai: {
    title: "OpenAI",
    setup: "Skapa en projekt-API-nyckel och lägg till den som OPENAI_API_KEY.",
    find: "OpenAI Platform -> API keys -> Create new secret key.",
    url: "https://platform.openai.com/api-keys",
  },
  zernio: {
    title: "Zernio",
    setup: "Lägg till ZERNIO_API_KEY för Zernio-baserade sociala konton, publicering, recensioner, inkorg och autosvar.",
    find: "Zernio dashboard -> Settings -> API Keys.",
    url: "https://zernio.com",
  },
  canva: {
    title: "Canva Connect",
    setup: "Skapa en Canva Connect-integration och lägg till CANVA_CLIENT_ID plus CANVA_CLIENT_SECRET. Användare kopplar sedan via Canva OAuth-knappen.",
    find: "Canva Developer Portal -> Your integrations -> OAuth settings. Lägg till appens callback-URL och aktivera scopes för designexport.",
    url: "https://www.canva.dev/docs/connect/authentication/",
  },
  google_drive: {
    title: "Google OAuth",
    setup: "Skapa en webb-OAuth-klient och lägg till GOOGLE_CLIENT_ID plus GOOGLE_CLIENT_SECRET.",
    find: "Google Cloud Console -> APIs & Services -> Credentials -> Create credentials -> OAuth client ID.",
    url: "https://developers.google.com/identity/protocols/oauth2",
  },
  google_ads: {
    title: "Google Ads",
    setup: "Använd Google OAuth-uppgifterna plus GOOGLE_ADS_DEVELOPER_TOKEN och kundnummervärdena.",
    find: "Developer token: Google Ads-managerkonto -> API Center. OAuth-klient: Google Cloud Credentials.",
    url: "https://developers.google.com/google-ads/api/docs/api-policy/developer-token",
  },
  meta_business: {
    title: "Meta Business",
    setup: "Skapa en Meta-app och lägg till META_APP_ID plus META_APP_SECRET, eller FACEBOOK_*-aliasen.",
    find: "Meta for Developers -> My Apps -> din app -> Settings -> Basic.",
    url: "https://developers.facebook.com/docs/development/create-an-app/",
  },
  pagespeed: {
    title: "PageSpeed Insights",
    setup: "Aktivera PageSpeed Insights API i Google Cloud och lägg till PAGESPEED_API_KEY.",
    find: "Google Cloud Console -> APIs & Services -> Credentials -> Create credentials -> API key.",
    url: "https://developers.google.com/speed/docs/insights/v5/get-started",
  },
  apiai: {
    title: "apiai.me",
    setup: "Lägg till APIAI_API_KEY för att använda Innehåll -> Skapa-verktyg, workflows och pipelines.",
    find: "Öppna ditt apiai.me-konto och kopiera din API-nyckel.",
    url: "https://apiai.me",
  },
  microsoft: {
    title: "Microsoft Outlook",
    setup: "Registrera en app i Microsoft Entra och lägg till MICROSOFT_CLIENT_ID plus MICROSOFT_CLIENT_SECRET.",
    find: "Microsoft Entra admin center -> App registrations -> din app -> Overview / Certificates & secrets.",
    url: "https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app",
  },
  notion: {
    title: "Notion",
    setup: "Skapa en publik Notion-integration och lägg till NOTION_CLIENT_ID, NOTION_CLIENT_SECRET och NOTION_APP_URL.",
    find: "Notion integrations -> din publika integration -> OAuth / Distribution settings.",
    url: "https://developers.notion.com/guides/get-started/authorization",
  },
  shopify: {
    title: "Shopify",
    setup: "Skapa en Shopify-app och lägg till SHOPIFY_API_KEY, SHOPIFY_API_SECRET och vid behov en publik SHOPIFY_APP_URL.",
    find: "Shopify Partner/Dev Dashboard -> Apps -> din app -> API credentials.",
    url: "https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets",
  },
  instagram_direct: {
    title: "Instagram direkt (reserv)",
    setup: "Behövs bara utan Zernio. Skapa en Meta-app och lägg till INSTAGRAM_CLIENT_ID plus INSTAGRAM_CLIENT_SECRET.",
    find: "Meta for Developers -> My Apps -> din app -> Instagram-produkten / Settings -> Basic.",
    url: "https://developers.facebook.com/docs/development/create-an-app/",
  },
  tiktok: {
    title: "TikTok",
    setup: "Skapa en TikTok-utvecklarapp och lägg till TIKTOK_CLIENT_KEY plus TIKTOK_CLIENT_SECRET.",
    find: "TikTok for Developers -> Manage apps -> din app.",
    url: "https://developers.tiktok.com/doc/login-kit-web/",
  },
  x: {
    title: "X / Twitter",
    setup: "Skapa en X-utvecklarapp med OAuth 2.0-användarinloggning och lägg till X_CLIENT_ID plus X_CLIENT_SECRET.",
    find: "X Developer Portal -> Projects & Apps -> din app -> Keys and tokens / User authentication settings.",
    url: "https://docs.x.com/fundamentals/authentication/oauth-2-0/overview",
  },
  tripadvisor: {
    title: "Tripadvisor",
    setup: "Lägg till TRIPADVISOR_API_KEY och TRIPADVISOR_LOCATION_ID, globalt eller per profil.",
    find: "API-nyckel via Tripadvisors utvecklaråtkomst. Location ID är det numeriska d-id:t i den publika Tripadvisor-sidans URL.",
    url: "https://www.tripadvisor.com/developers",
  },
};

const KEY_TO_TARGET: Record<string, string> = {
  OPENAI_API_KEY: "openai",
  ZERNIO_API_KEY: "zernio",
  LATE_API_KEY: "zernio",
  CANVA_ACCESS_TOKEN: "canva",
  CANVA_CLIENT_ID: "canva",
  CANVA_CLIENT_SECRET: "canva",
  GOOGLE_CLIENT_ID: "google_drive",
  GOOGLE_CLIENT_SECRET: "google_drive",
  GOOGLE_ADS_DEVELOPER_TOKEN: "google_ads",
  GOOGLE_ADS_CUSTOMER_ID: "google_ads",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "google_ads",
  META_APP_ID: "meta_business",
  META_APP_SECRET: "meta_business",
  FACEBOOK_CLIENT_ID: "meta_business",
  FACEBOOK_CLIENT_SECRET: "meta_business",
  FACEBOOK_APP_ID: "meta_business",
  FACEBOOK_APP_SECRET: "meta_business",
  PAGESPEED_API_KEY: "pagespeed",
  GOOGLE_PAGESPEED_API_KEY: "pagespeed",
  MICROSOFT_CLIENT_ID: "microsoft",
  MICROSOFT_CLIENT_SECRET: "microsoft",
  NOTION_CLIENT_ID: "notion",
  NOTION_CLIENT_SECRET: "notion",
  NOTION_APP_URL: "notion",
  SHOPIFY_API_KEY: "shopify",
  SHOPIFY_API_SECRET: "shopify",
  SHOPIFY_APP_URL: "shopify",
  INSTAGRAM_CLIENT_ID: "instagram_direct",
  INSTAGRAM_CLIENT_SECRET: "instagram_direct",
  TIKTOK_CLIENT_KEY: "tiktok",
  TIKTOK_CLIENT_SECRET: "tiktok",
  X_CLIENT_ID: "x",
  X_CLIENT_SECRET: "x",
  TRIPADVISOR_API_KEY: "tripadvisor",
  TRIPADVISOR_LOCATION_ID: "tripadvisor",
  APIAI_API_KEY: "apiai",
};

const EXTRA_HELP_BY_KEY: Record<string, IntegrationHelp> = {
  APIAI_API_KEY: {
    title: "apiai.me",
    setup: "Lägg till APIAI_API_KEY för att använda Innehåll -> Skapa-verktyg, workflows och pipelines.",
    find: "Öppna ditt apiai.me-konto och kopiera din API-nyckel.",
    url: "https://apiai.me",
  },
};

function helpForKey(key: string): IntegrationHelp | null {
  return EXTRA_HELP_BY_KEY[key] ?? HELP_BY_TARGET[KEY_TO_TARGET[key] || ""] ?? null;
}

function IntegrationHelpIcon({ help }: { help: IntegrationHelp | null }) {
  if (!help) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Help for ${help.title}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-2" side="top" align="start">
        <p className="text-xs font-medium text-foreground">{help.title}</p>
        <p className="text-xs">{help.setup}</p>
        <p className="text-xs">{help.find}</p>
        <a href={help.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
          Open docs
          <ExternalLink className="h-3 w-3" />
        </a>
      </TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Konfigurerad
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      Saknas
    </span>
  );
}

const PREFERENCES_TABS = ["overview", "ai", "api-keys", "team", "navigation", "data", "help"] as const;
type PreferencesTab = (typeof PREFERENCES_TABS)[number];

function parsePreferencesTab(raw: string | null): PreferencesTab {
  if (raw && (PREFERENCES_TABS as readonly string[]).includes(raw)) {
    return raw as PreferencesTab;
  }
  return "overview";
}

export default function PreferencesPage() {
  const { t } = useTranslation("preferences");
  const { toast } = useToast();
  const navigate = useNavigate();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab = parsePreferencesTab(rawTab);

  const overviewFeatures = [
    {
      icon: Bell,
      title: t("features.notifications"),
      desc: t("features.notificationsDesc"),
    },
    {
      icon: Shield,
      title: t("features.security"),
      desc: t("features.securityDesc"),
    },
  ];
  const setActiveTab = useCallback(
    (tab: PreferencesTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === "overview") next.delete("tab");
          else next.set("tab", tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (rawTab === "automation") {
      navigate("/automations", { replace: true });
    }
  }, [rawTab, navigate]);
  const [globalEntries, setGlobalEntries] = useState<GlobalEntry[]>([]);
  const [tenantEntries, setTenantEntries] = useState<TenantEntry[]>([]);
  const [storeEnabled, setStoreEnabled] = useState(true);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningTests, setRunningTests] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConfigTestResult>>({});
  const [apiaiTesting, setApiaiTesting] = useState(false);

  const handleTestApiai = useCallback(async () => {
    if (!activeBusinessProfileId) return;
    setApiaiTesting(true);
    try {
      const health = await checkApiaiHealth(activeBusinessProfileId);
      if (health.ok) {
        toast({
          title: "apiai.me är kopplat",
          description: `${health.toolCount} verktyg tillgängliga (${health.workflowCount} workflows, ${health.flowCount} flöden) · ${health.latencyMs ?? "?"} ms.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "apiai.me-kontrollen misslyckades",
          description: health.error ?? "Okänt fel.",
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Kunde inte nå servern",
        description: e instanceof Error ? e.message : "Anropet misslyckades.",
      });
    } finally {
      setApiaiTesting(false);
    }
  }, [activeBusinessProfileId, toast]);

  const loadGlobal = useCallback(async () => {
    const payload = await apiJson<{ entries?: unknown }>(
      "/api/settings/api-keys",
      "Kunde inte ladda plattformsnycklar."
    );
    setGlobalEntries(Array.isArray(payload.entries) ? payload.entries : []);
  }, []);

  const loadTenant = useCallback(async (businessProfileId: string) => {
    const payload = await apiJson<{ storeEnabled?: unknown; entries?: unknown }>(
      `/api/settings/secrets?business_profile_id=${encodeURIComponent(businessProfileId)}`,
      "Kunde inte ladda profilnycklar."
    );
    setStoreEnabled(Boolean(payload.storeEnabled));
    setTenantEntries(Array.isArray(payload.entries) ? payload.entries : []);
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setEdited({});
      try {
        await loadGlobal();
        if (activeBusinessProfileId) {
          await loadTenant(activeBusinessProfileId);
        } else {
          setTenantEntries([]);
        }
      } catch (error) {
        if (!ignore) {
          toast({
            title: "Kunde inte ladda inställningar",
            description: error instanceof Error ? error.message : "Okänt fel",
            variant: "destructive",
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [activeBusinessProfileId, loadGlobal, loadTenant, toast]);

  const dirtyKeys = useMemo(() => Object.keys(edited), [edited]);

  async function handleSaveTenant() {
    if (!activeBusinessProfileId || dirtyKeys.length === 0) return;
    const entries = dirtyKeys.map((key) => ({ key, value: edited[key] }));
    setSaving(true);
    try {
      await apiJson("/api/settings/secrets", "Kunde inte spara nycklarna.", {
        method: "PUT",
        body: { business_profile_id: activeBusinessProfileId, entries },
      });
      setEdited({});
      await loadTenant(activeBusinessProfileId);
      toast({
        title: "Profilnycklar sparade",
        description: "Krypterade och lagrade för den här företagsprofilen.",
      });
    } catch (error) {
      toast({
        title: "Kunde inte spara nycklarna",
        description: error instanceof Error ? error.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runConfigTest(target: string) {
    setRunningTests((current) => ({ ...current, [target]: true }));
    try {
      const payload = await apiJson<ConfigTestResult>(
        "/api/settings/api-keys/test",
        `Kunde inte testa ${target}.`,
        { body: { target } }
      );
      setTestResults((current) => ({ ...current, [target]: payload }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setTestResults((current) => ({
        ...current,
        [target]: { ok: false, missing: [], missingAny: [], message },
      }));
    } finally {
      setRunningTests((current) => ({ ...current, [target]: false }));
    }
  }

  const unconfiguredCount = useMemo(() => {
    const global = globalEntries.filter((e) => !e.configured).length;
    const tenant = tenantEntries.filter((e) => !e.configured).length;
    return global + tenant;
  }, [globalEntries, tenantEntries]);

  return (
    <div className="space-y-6 max-w-5xl w-full mx-auto">
      <PageHeader
        icon={Wrench}
        title={t("title")}
        description={t("description")}
      />

      <PageSmartBar
        title={t("smartBar")}
        steps={[t("step1"), t("step2"), t("step3")]}
        tip={t("tip")}
        liveHintOverride={
          unconfiguredCount > 0
            ? t("keysMissing", { count: unconfiguredCount })
            : !storeEnabled
              ? t("secretStoreOff")
              : null
        }
      />

      <div className="app-workspace-shell !min-h-0">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PreferencesTab)} className="flex w-full min-h-0 flex-1 flex-col">
        <div className="app-workspace-toolbar px-3 pt-1 sm:px-4">
          <PageModeTabs
            value={activeTab}
            aria-label={t("tabsAria")}
            onChange={setActiveTab}
            options={[
              { value: "overview", label: t("tabs.overview") },
              { value: "ai", label: t("tabs.ai") },
              { value: "api-keys", label: t("tabs.apiKeys"), count: unconfiguredCount },
              { value: "team", label: t("tabs.team") },
              { value: "navigation", label: t("tabs.navigation") },
              { value: "data", label: t("tabs.data") },
              { value: "help", label: t("tabs.help") },
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">

        <TabsContent value="overview" className="space-y-4 pt-2">
          <LanguageSettingsSection />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="bg-card border-border glow-border h-full">
                <CardContent className="p-5 space-y-3">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("features.handbook")}</p>
                  <p className="text-xs text-muted-foreground">{t("features.handbookDesc")}</p>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/handbook">{t("features.handbookCta")}</Link>
                  </Button>
                </CardContent>
              </Card>
            </m.div>
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.06 }}
            >
              <Card className="bg-card border-border glow-border h-full">
                <CardContent className="p-5 space-y-3">
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("features.welcomeTour")}</p>
                  <p className="text-xs text-muted-foreground">{t("features.welcomeTourDesc")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      navigate("/");
                      openWelcomeTour();
                    }}
                  >
                    {t("features.welcomeTourCta")}
                  </Button>
                </CardContent>
              </Card>
            </m.div>
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card className="bg-card border-border glow-border h-full">
                <CardContent className="p-5 space-y-2">
                  <LayoutGrid className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("features.appearance")}</p>
                  <p className="text-xs text-muted-foreground">{t("features.appearanceDesc")}</p>
                </CardContent>
              </Card>
            </m.div>
            {overviewFeatures.map((feature, index) => (
              <m.div
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.14 + index * 0.06 }}
              >
                <Card className="bg-card border-border glow-border h-full">
                  <CardContent className="p-5 space-y-2">
                    <feature.icon className="h-6 w-6 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{feature.title}</p>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("features.comingSoon")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              </m.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="team">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Teamhantering
              </CardTitle>
              <CardDescription>
                Bjud in kollegor och hantera åtkomst till just denna profil. Varje person loggar in
                med sitt eget konto och ser bara den här profilen — inga andra profiler du har
                tillgång till. Den som skapade profilen är alltid ägare och kan aldrig tas bort.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeBusinessProfileId ? (
                <TeamManager businessProfileId={activeBusinessProfileId} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Välj ett företagsprofil för att hantera teammedlemmar.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="navigation">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" />
                Genvägar
              </CardTitle>
              <CardDescription>
                Välj dina egna genvägar för bottenmenyn på mobilen och ”Gå till” på Hem. Sparat per
                företagsprofil.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuickNavPrefsEditor />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <AiSettingsSection
            businessProfileId={activeBusinessProfileId ?? null}
            onOpenIntegrations={() => setActiveTab("api-keys")}
          />
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-5">
          {loading ? (
            <p className="text-sm text-muted-foreground pt-2">Laddar inställningar…</p>
          ) : (
            <>
              {/* Per-profile secrets (editable) */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    Dina integrationsnycklar (denna profil)
                  </CardTitle>
                  <CardDescription>
                    Egna nycklar för den aktiva företagsprofilen. Lagras krypterat och används före
                    plattformsstandarderna. Lämna tomt för att använda standardvärden.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!activeBusinessProfileId ? (
                    <p className="text-sm text-muted-foreground">
                      Välj en företagsprofil för att hantera dess integrationsnycklar.
                    </p>
                  ) : !storeEnabled ? (
                    <p className="text-sm text-muted-foreground">
                      Hemlighetslagret är inte konfigurerat på servern (behöver
                      <code className="text-xs mx-1">SECRETS_ENCRYPTION_KEY</code> och
                      <code className="text-xs mx-1">SUPABASE_SERVICE_ROLE_KEY</code>). Plattformens
                      standardvärden från miljövariabler används.
                    </p>
                  ) : (
                    <>
                      {tenantEntries.map((entry) => {
                        const isDirty = entry.key in edited;
                        const value = isDirty ? edited[entry.key] : "";
                        return (
                          <div key={entry.key} className="rounded-lg border border-border p-4 space-y-3">
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] gap-3 items-start">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Label htmlFor={`secret-${entry.key}`}>{entry.label}</Label>
                                  <IntegrationHelpIcon help={helpForKey(entry.key)} />
                                </div>
                                <p className="text-[11px] text-muted-foreground font-mono">{entry.key}</p>
                              </div>
                              <div className="space-y-1.5">
                                <Input
                                  id={`secret-${entry.key}`}
                                  type={entry.inputType === "text" ? "text" : "password"}
                                  value={value}
                                  onChange={(e) =>
                                    setEdited((cur) => ({ ...cur, [entry.key]: e.target.value }))
                                  }
                                  placeholder={
                                    entry.tenantOverride
                                      ? "•••••• (profilöverskrivning — skriv för att byta)"
                                      : entry.inputType === "text"
                                        ? "Ange värde"
                                        : "Klistra in hemligheten"
                                  }
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{entry.description}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <StatusBadge configured={entry.configured} />
                              {entry.tenantOverride ? (
                                <>
                                  <span className="text-muted-foreground">Profilöverskrivning aktiv</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setEdited((cur) => ({ ...cur, [entry.key]: "" }))}
                                  >
                                    Rensa överskrivning
                                  </Button>
                                </>
                              ) : entry.configured ? (
                                <span className="text-muted-foreground">Använder plattformsstandard</span>
                              ) : null}
                              {entry.key === "APIAI_API_KEY" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] ml-auto"
                                  onClick={() => void handleTestApiai()}
                                  disabled={apiaiTesting}
                                >
                                  {apiaiTesting ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  ) : null}
                                  Testa koppling
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-end">
                        <Button onClick={() => void handleSaveTenant()} disabled={saving || dirtyKeys.length === 0}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Sparar…" : "Spara profilnycklar"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Global platform keys (read-only status) */}
              <Card className="bg-muted/30 border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lock className="h-4 w-4" />
                    Plattformsnycklar (hanteras av operatören)
                  </CardTitle>
                  <CardDescription>
                    OAuth-appuppgifter och delade nycklar som sätts som miljövariabler (lokalt och
                    på Vercel). Skrivskyddade här — värdena exponeras aldrig.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {globalEntries.map((entry) => (
                      <div
                        key={entry.key}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="text-xs font-mono truncate">{entry.key}</span>
                          <IntegrationHelpIcon help={helpForKey(entry.key)} />
                        </span>
                        <StatusBadge configured={entry.configured} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Config probes */}
              <Card className="bg-muted/30 border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4" />
                    Integration tests
                  </CardTitle>
                  <CardDescription>
                    Validate whether each integration has the required platform configuration.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {featureRequirements.map((feature) => {
                    const target = feature.testTarget;
                    const result = testResults[target];
                    const testing = runningTests[target];
                    return (
                      <div key={feature.name} className="rounded-lg border border-border bg-background p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium">{feature.name}</p>
                            <IntegrationHelpIcon help={HELP_BY_TARGET[target] ?? null} />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void runConfigTest(target)}
                            disabled={testing}
                          >
                            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
                            Test
                          </Button>
                        </div>
                        {result && (
                          <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {result.ok ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                                  <XCircle className="h-3.5 w-3.5" />
                                  Missing config
                                </span>
                              )}
                              {result.authPath && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" asChild>
                                  <a href={result.authPath} target="_blank" rel="noopener noreferrer">
                                    Open auth
                                    <ExternalLink className="h-3.5 w-3.5 ml-1" />
                                  </a>
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{result.message}</p>
                            {result.missing.length > 0 && (
                              <p className="text-xs text-muted-foreground">Missing: {result.missing.join(", ")}</p>
                            )}
                            {result.missingAny.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Missing one of: {result.missingAny.map((group) => group.join(" or ")).join(" · ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="data" className="pt-2">
          <PreferencesDataSection />
        </TabsContent>

        <TabsContent value="help">
          <ZernioHelpTab />
        </TabsContent>
        </div>
      </Tabs>
      </div>
    </div>
  );
}
