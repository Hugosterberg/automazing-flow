import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { m } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, McpMultiSourceCompare, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { apiUrl } from "@/lib/apiBase";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatDateTimeMedium } from "@/lib/format";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

type RecommendationArea = "seo" | "performance" | "trust" | "channels";
type RecommendationPriority = "high" | "medium" | "low";

type WebsiteAudit = {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  responseTimeMs: number;
  contentType: string;
  pageSizeBytes: number;
  checkedAt: string;
  robotsTxtStatus: number | null;
  sitemapXmlStatus: number | null;
  title: string;
  titleLength: number;
  metaDescription: string;
  metaDescriptionLength: number;
  h1Texts: string[];
  canonical: string;
  robotsMeta: string;
  viewport: string;
  ogTitle: string;
  ogDescription: string;
  structuredDataCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  auditSource?: "pagespeed" | "html_fallback";
  pageSpeed?: {
    apiKeyConfigured: boolean;
    mobile: PageSpeedSummary | null;
    desktop: PageSpeedSummary | null;
    error: string | null;
  };
  htmlFallbackError?: string | null;
};

type PageSpeedMetric = {
  score: number | null;
  numericValue: number | null;
  displayValue: string | null;
  title: string | null;
};

type PageSpeedSummary = {
  strategy: "mobile" | "desktop";
  requestedUrl: string;
  finalUrl: string;
  fetchTime: string;
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  metrics: {
    firstContentfulPaint: PageSpeedMetric;
    largestContentfulPaint: PageSpeedMetric;
    cumulativeLayoutShift: PageSpeedMetric;
    totalBlockingTime: PageSpeedMetric;
    speedIndex: PageSpeedMetric;
    interactive: PageSpeedMetric;
  };
  seoAudits: Record<string, PageSpeedMetric>;
  diagnostics: Record<string, PageSpeedMetric>;
  crux: {
    overallCategory: string | null;
    originOverallCategory: string | null;
    metrics: Record<string, { percentile: number | null; category: string | null } | null>;
  };
};

type BrandRecommendation = {
  area: RecommendationArea;
  priority: RecommendationPriority;
  title: string;
  detail: string;
  value: string;
};

const AREA_LABELS: Record<RecommendationArea, string> = {
  seo: "SEO",
  performance: "Prestanda",
  trust: "Förtroende",
  channels: "Kanaler",
};

const AREA_ICONS: Record<RecommendationArea, ComponentType<{ className?: string }>> = {
  seo: Search,
  performance: Gauge,
  trust: ShieldCheck,
  channels: MapPin,
};

const PRIORITY_CLASS: Record<RecommendationPriority, string> = {
  high: "border-warning/40 bg-warning/10 text-warning",
  medium: "border-info/40 bg-info/10 text-info",
  low: "border-border bg-muted text-muted-foreground",
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

function bytesLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function statusLabel(status: number | null) {
  return status == null ? "Hittades inte" : String(status);
}

function priorityForPass(pass: boolean, warning = false): RecommendationPriority {
  if (pass) return "low";
  return warning ? "medium" : "high";
}

function scorePriority(score: number | null | undefined): RecommendationPriority {
  if (score == null) return "medium";
  if (score >= 90) return "low";
  if (score >= 50) return "medium";
  return "high";
}

function scoreLabel(score: number | null | undefined) {
  return score == null ? "Ingen data" : `${score}/100`;
}

function metricDisplay(metric: PageSpeedMetric | undefined) {
  if (!metric) return "Ingen data";
  return metric.displayValue || (metric.numericValue != null ? String(Math.round(metric.numericValue)) : "Ingen data");
}

function buildRecommendations(params: {
  websiteUrl: string | null;
  audit: WebsiteAudit | null;
  connectedPlatforms: Set<string>;
}): BrandRecommendation[] {
  const { websiteUrl, audit, connectedPlatforms } = params;
  if (!websiteUrl) {
    return [
      {
        area: "seo",
        priority: "high",
        title: "Registrera er primära webbplats",
        value: "Ingen URL",
        detail: "Lägg till webbadressen under Kopplingar innan du kör en Digital Brand-audit.",
      },
    ];
  }
  if (!audit) return [];

  const hasGoogleBusiness =
    connectedPlatforms.has("google_business") || connectedPlatforms.has("google_reviews");
  const hasReviews =
    connectedPlatforms.has("google_reviews") || connectedPlatforms.has("tripadvisor");
  const hasSocial =
    connectedPlatforms.has("instagram") ||
    connectedPlatforms.has("facebook") ||
    connectedPlatforms.has("tiktok") ||
    connectedPlatforms.has("youtube") ||
    connectedPlatforms.has("x");
  const hasAds =
    connectedPlatforms.has("google_ads") || connectedPlatforms.has("meta_business");
  const mobilePsi = audit.pageSpeed?.mobile;
  const desktopPsi = audit.pageSpeed?.desktop;
  const primaryPsi = mobilePsi || desktopPsi;
  const titleOk = audit.titleLength >= 25 && audit.titleLength <= 65;
  const metaOk = audit.metaDescriptionLength >= 70 && audit.metaDescriptionLength <= 160;
  const h1Ok = audit.h1Texts.length === 1;
  const altMissingRate = audit.imageCount > 0 ? audit.imagesMissingAlt / audit.imageCount : 0;

  return [
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.scores.performance ?? desktopPsi?.scores.performance),
          title: "PageSpeed-prestandapoäng",
          value: scoreLabel(mobilePsi?.scores.performance ?? desktopPsi?.scores.performance),
          detail: mobilePsi
            ? `Mobil Lighthouse-prestanda är ${scoreLabel(mobilePsi.scores.performance)}. Desktop är ${scoreLabel(desktopPsi?.scores.performance)}.`
            : `Desktop Lighthouse-prestanda är ${scoreLabel(desktopPsi?.scores.performance)}.`,
        }
      : {
          area: "performance",
          priority: "medium",
          title: "PageSpeed Insights otillgängligt",
          value: audit.pageSpeed?.apiKeyConfigured ? "Inget PSI-resultat" : "Ingen API-nyckel",
          detail: audit.pageSpeed?.error || "Lägg till PAGESPEED_API_KEY eller GOOGLE_PAGESPEED_API_KEY för Lighthouse-värden.",
        },
    primaryPsi
      ? {
          area: "seo",
          priority: scorePriority(mobilePsi?.scores.seo ?? desktopPsi?.scores.seo),
          title: "Lighthouse SEO-poäng",
          value: scoreLabel(mobilePsi?.scores.seo ?? desktopPsi?.scores.seo),
          detail:
            "Detta är Lighthouse SEO-kategoripoängen från PageSpeed Insights för den registrerade URL:en.",
        }
      : null,
    primaryPsi
      ? {
          area: "trust",
          priority: scorePriority(mobilePsi?.scores.accessibility ?? desktopPsi?.scores.accessibility),
          title: "Tillgänglighetspoäng",
          value: scoreLabel(mobilePsi?.scores.accessibility ?? desktopPsi?.scores.accessibility),
          detail:
            "Tillgänglighetsproblem påverkar ofta konvertering, användbarhet och upplevd varumärkeskvalitet.",
        }
      : null,
    primaryPsi
      ? {
          area: "trust",
          priority: scorePriority(mobilePsi?.scores.bestPractices ?? desktopPsi?.scores.bestPractices),
          title: "Poäng för bästa praxis",
          value: scoreLabel(mobilePsi?.scores.bestPractices ?? desktopPsi?.scores.bestPractices),
          detail:
            "Lighthouse best-practices kontrollerar säkerhet, webbläsarkompatibilitet och implementeringskvalitet.",
        }
      : null,
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.metrics.largestContentfulPaint.score ?? desktopPsi?.metrics.largestContentfulPaint.score),
          title: "Largest Contentful Paint",
          value: metricDisplay(mobilePsi?.metrics.largestContentfulPaint ?? desktopPsi?.metrics.largestContentfulPaint),
          detail:
            "LCP mäter hur snabbt huvudinnehållet laddas. Optimera hero-media, serversvar och render-blockande resurser.",
        }
      : null,
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.metrics.cumulativeLayoutShift.score ?? desktopPsi?.metrics.cumulativeLayoutShift.score),
          title: "Cumulative Layout Shift",
          value: metricDisplay(mobilePsi?.metrics.cumulativeLayoutShift ?? desktopPsi?.metrics.cumulativeLayoutShift),
          detail:
            "CLS mäter visuell stabilitet. Reservera utrymme för bilder/annonser och undvik sent laddat UI som flyttar innehåll.",
        }
      : null,
    {
      area: "performance",
      priority: priorityForPass(audit.ok),
      title: "Startsida HTTP-status",
      value: `${audit.status}`,
      detail: audit.ok
        ? `Startsidan returnerade HTTP ${audit.status}.`
        : `Startsidan returnerade HTTP ${audit.status}; åtgärda detta innan du optimerar SEO-innehåll.`,
    },
    {
      area: "performance",
      priority: priorityForPass(audit.responseTimeMs <= 1200, audit.responseTimeMs <= 2500),
      title: "Serversvarstid",
      value: `${audit.responseTimeMs} ms`,
      detail:
        audit.responseTimeMs <= 1200
          ? "Det initiala serversvaret ligger inom ett hälsosamt intervall."
          : "Minska omdirigeringar, serverarbete och blockerande uppströmsanrop för att förbättra det initiala svaret.",
    },
    {
      area: "performance",
      priority: priorityForPass(audit.pageSizeBytes <= 350_000, audit.pageSizeBytes <= 900_000),
      title: "Nedladdad HTML-storlek",
      value: bytesLabel(audit.pageSizeBytes),
      detail:
        audit.pageSizeBytes <= 350_000
          ? "HTML-payloaden är rimligt liten."
          : "HTML-payloaden är stor; minska inline-skript, inbäddad data och oanvänd markup.",
    },
    {
      area: "seo",
      priority: priorityForPass(titleOk, Boolean(audit.title)),
      title: "Title-taggens längd",
      value: audit.title ? `${audit.titleLength} tecken` : "Saknas",
      detail: audit.title
        ? `Nuvarande title: "${audit.title}". Sikta på en beskrivande title på 25–65 tecken.`
        : "Lägg till en unik title-tagg som namnger varumärke, erbjudande och huvudsaklig sökintention.",
    },
    {
      area: "seo",
      priority: priorityForPass(metaOk, Boolean(audit.metaDescription)),
      title: "Metabeskrivning",
      value: audit.metaDescription ? `${audit.metaDescriptionLength} tecken` : "Saknas",
      detail: audit.metaDescription
        ? `Nuvarande metabeskrivning är ${audit.metaDescriptionLength} tecken. Sikta på 70–160.`
        : "Lägg till en metabeskrivning som sammanfattar erbjudandet och ger sökare en anledning att klicka.",
    },
    {
      area: "seo",
      priority: priorityForPass(h1Ok, audit.h1Texts.length > 0),
      title: "H1-struktur",
      value: `${audit.h1Texts.length} H1`,
      detail:
        audit.h1Texts.length === 1
          ? `Primär H1: "${audit.h1Texts[0]}".`
          : "Använd exakt en tydlig H1 på startsidan så sökmotorer och besökare förstår sidans ämne.",
    },
    {
      area: "seo",
      priority: priorityForPass(Boolean(audit.canonical), true),
      title: "Kanonisk URL",
      value: audit.canonical ? "Finns" : "Saknas",
      detail: audit.canonical
        ? `Kanonisk pekar på ${audit.canonical}.`
        : "Lägg till en kanonisk URL för att förhindra att duplicerade startsidevarianter konkurrerar i sök.",
    },
    {
      area: "seo",
      priority: priorityForPass(audit.structuredDataCount > 0, true),
      title: "Strukturerad data",
      value: `${audit.structuredDataCount} JSON-LD-block`,
      detail:
        audit.structuredDataCount > 0
          ? "Strukturerad data finns på sidan."
          : "Lägg till Organization-, LocalBusiness-, FAQ-, Product- eller Review-schema där det är relevant.",
    },
    {
      area: "seo",
      priority: priorityForPass(audit.sitemapXmlStatus != null && audit.sitemapXmlStatus < 400, true),
      title: "Sitemap-kontroll",
      value: statusLabel(audit.sitemapXmlStatus),
      detail:
        audit.sitemapXmlStatus != null && audit.sitemapXmlStatus < 400
          ? "/sitemap.xml är nåbar."
          : "Exponera /sitemap.xml så sökmotorer kan hitta viktiga sidor snabbare.",
    },
    {
      area: "trust",
      priority: priorityForPass(websiteUrl.startsWith("https://")),
      title: "HTTPS",
      value: websiteUrl.startsWith("https://") ? "HTTPS" : "HTTP",
      detail: websiteUrl.startsWith("https://")
        ? "Den registrerade webbplatsen använder HTTPS."
        : "Byt den registrerade URL:en till HTTPS och omdirigera HTTP till HTTPS.",
    },
    {
      area: "trust",
      priority: priorityForPass(Boolean(audit.viewport), true),
      title: "Mobil viewport",
      value: audit.viewport ? "Finns" : "Saknas",
      detail: audit.viewport
        ? `Viewport meta: ${audit.viewport}.`
        : "Lägg till en viewport meta-tagg så sidan renderas förutsägbart på mobila enheter.",
    },
    {
      area: "trust",
      priority: priorityForPass(altMissingRate <= 0.15, altMissingRate <= 0.35),
      title: "Alt-text för bilder",
      value: `${audit.imagesMissingAlt}/${audit.imageCount} saknas`,
      detail:
        audit.imageCount === 0
          ? "Inga bilder hittades i den hämtade HTML:en."
          : "Lägg till beskrivande alt-text på viktiga bilder och tom alt-text på dekorativa bilder.",
    },
    {
      area: "trust",
      priority: priorityForPass(Boolean(audit.ogTitle && audit.ogDescription), true),
      title: "Förhandsvisning i sociala medier",
      value: audit.ogTitle && audit.ogDescription ? "Komplett" : "Ofullständig",
      detail:
        audit.ogTitle && audit.ogDescription
          ? "Open Graph title och description finns."
          : "Lägg till Open Graph title och description så delade länkar visas tydligt i sociala kanaler.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasGoogleBusiness, true),
      title: "Google Business-koppling",
      value: hasGoogleBusiness ? "Kopplad" : "Ej kopplad",
      detail: hasGoogleBusiness
        ? "Google Business är kopplat så lokala varumärkessignaler kan jämföras med webbplatsen."
        : "Koppla Google Business för att synka webbinnehåll med kartor, kategorier, öppettider och recensioner.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasReviews, true),
      title: "Recensionskällor",
      value: hasReviews ? "Kopplad" : "Ej kopplad",
      detail: hasReviews
        ? "Recensionskällor är kopplade och kan informera förtroendemeddelanden."
        : "Koppla Google Reviews eller Tripadvisor för att använda verkliga recensionsteman i webboptimering.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasSocial, true),
      title: "Sociala kanaler",
      value: hasSocial ? "Kopplad" : "Ej kopplad",
      detail: hasSocial
        ? "Sociala kanaler är kopplade och kan jämföras med webbplatsens budskap."
        : "Koppla aktiva sociala profiler för att jämföra varumärkespositionering mellan kanaler.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasAds, true),
      title: "Betalda mediakanaler",
      value: hasAds ? "Kopplad" : "Ej kopplad",
      detail: hasAds
        ? "Betalkanalerna är kopplade, användbara för landningssida- och CTA-anpassning."
        : "Koppla Google Ads eller Meta Business innan kampanjspecifik landningssideoptimering.",
    },
  ].filter((item): item is BrandRecommendation => Boolean(item));
}

function calculateReadiness(audit: WebsiteAudit | null, recommendations: BrandRecommendation[]) {
  if (!audit) return 0;
  const penalty = recommendations.reduce((sum, item) => {
    if (item.priority === "high") return sum + 9;
    if (item.priority === "medium") return sum + 4;
    return sum;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

async function fetchAudit(websiteUrl: string): Promise<WebsiteAudit> {
  const params = new URLSearchParams({ url: websiteUrl });
  const response = await fetchWithTimeout(apiUrl(`/api/digital-brand/audit?${params.toString()}`), {
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Kunde inte granska webbplatsen.");
  }
  return payload as WebsiteAudit;
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <Icon className="mb-2 h-4 w-4 text-primary" />
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ recommendation }: { recommendation: BrandRecommendation }) {
  const Icon = AREA_ICONS[recommendation.area];
  return (
    <Card className="border-border">
      <CardContent className="flex gap-3 p-4">
        <div className="h-fit rounded-md bg-muted/60 p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{recommendation.title}</h3>
            <Badge variant="outline" className={cn("text-[10px] capitalize", PRIORITY_CLASS[recommendation.priority])}>
              {recommendation.priority}
            </Badge>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {recommendation.value}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{recommendation.detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DigitalBrandPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const { activeProfile, accounts, activeProfileId } = useAccounts();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const websiteUrl = safeWebsiteUrl(activeProfile?.website);
  const hostname = websiteHostname(websiteUrl);
  const connectedPlatforms = useMemo(() => new Set(accounts.map((account) => account.platform)), [accounts]);
  const [audit, setAudit] = useState<WebsiteAudit | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAllBrandMetrics, setShowAllBrandMetrics] = useState(false);

  async function runAudit() {
    if (!websiteUrl) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      setAudit(await fetchAudit(websiteUrl));
    } catch (error) {
      setAudit(null);
      setAuditError(error instanceof Error ? error.message : "Kunde inte granska webbplatsen.");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    setAudit(null);
    setAuditError(null);
    if (websiteUrl) void runAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteUrl]);

  const recommendations = useMemo(
    () => buildRecommendations({ websiteUrl, audit, connectedPlatforms }),
    [websiteUrl, audit, connectedPlatforms]
  );
  const highCount = recommendations.filter((item) => item.priority === "high").length;
  const readinessScore = calculateReadiness(audit, recommendations);
  const mobilePageSpeed = audit?.pageSpeed?.mobile || null;
  const desktopPageSpeed = audit?.pageSpeed?.desktop || null;

  function recsFor(area: RecommendationArea) {
    return recommendations.filter((item) => item.area === area);
  }

  const [searchParams, setSearchParams] = useSearchParams();
  type BrandTab = "overview" | "recs" | "research";
  type RecAreaTab = RecommendationArea | "all";
  const BRAND_TABS: BrandTab[] = ["overview", "recs", "research"];
  const REC_AREAS: RecAreaTab[] = ["seo", "performance", "trust", "channels", "all"];
  const rawBrandTab = searchParams.get("tab");
  const brandTab: BrandTab =
    rawBrandTab && (BRAND_TABS as string[]).includes(rawBrandTab)
      ? (rawBrandTab as BrandTab)
      : "overview";
  const rawArea = searchParams.get("area");
  const recArea: RecAreaTab =
    rawArea && (REC_AREAS as string[]).includes(rawArea) ? (rawArea as RecAreaTab) : "seo";

  function setBrandTab(next: BrandTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") {
      params.delete("tab");
      params.delete("area");
    } else {
      params.set("tab", next);
      if (next !== "recs") params.delete("area");
    }
    setSearchParams(params, { replace: true });
  }

  function setRecArea(next: RecAreaTab) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "recs");
    if (next === "seo") params.delete("area");
    else params.set("area", next);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Digitalt varumärke"
        description="Live webbplatsaudit plus SEO-, prestanda-, förtroende- och kanalrekommendationer."
        actions={
          <div className="flex flex-wrap gap-2">
            {websiteUrl ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void runAudit()} disabled={auditLoading}>
                {auditLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Uppdatera audit
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to="/connections">
                <Globe2 className="mr-1.5 h-3.5 w-3.5" />
                Redigera webbadress
              </Link>
            </Button>
          </div>
        }
      />

      <PageSmartBar
        title="Digitalt varumärke granskar er webbplats live — SEO, prestanda och förtroende med konkreta rekommendationer."
        steps={[
          "Registrera webbadress under Kopplingar",
          "Kör audit och granska PageSpeed- och HTML-värden",
          "Prioritera höga rekommendationer under fliken Rekommendationer",
        ]}
        tip="Auditen körs server-side — ingen kod behöver installeras på sidan."
        liveHintOverride={
          !websiteUrl
            ? "Lägg till webbadress under Kopplingar för att köra audit."
            : highCount > 0
              ? `${highCount} högprioriterad${highCount === 1 ? "" : "e"} rekommendation${highCount === 1 ? "" : "er"} — öppna Rekommendationer`
              : audit
                ? "Auditen ser bra ut — inga kritiska punkter just nu."
                : null
        }
        extraActions={
          highCount > 0 ? [{ label: "Visa rekommendationer", onClick: () => setBrandTab("recs") }] : []
        }
      />

      <PageModeTabs
        value={brandTab}
        aria-label="Digitalt varumärke-flikar"
        onChange={setBrandTab}
        options={[
          { value: "recs", label: "Rekommendationer", count: highCount },
          { value: "overview", label: "Översikt" },
          { value: "research", label: "Research" },
        ]}
      />

      {!websiteUrl ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ingen webbadress registrerad</AlertTitle>
          <AlertDescription>
            Lägg till webbadressen under{" "}
            <Link to="/connections" className="text-primary underline underline-offset-2">
              Kopplingar
            </Link>{" "}
            för att köra en Digital Brand-audit.
          </AlertDescription>
        </Alert>
      ) : auditError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Kunde inte granska webbplatsen</AlertTitle>
          <AlertDescription>{auditError}</AlertDescription>
        </Alert>
      ) : null}

      {brandTab === "research" ? (
      <m.div {...pageFadeUp} className="space-y-4">
        <McpMultiSourceCompare businessProfileId={businessProfileId} initialSubject={hostname ?? ""} />
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS["digital-brand"]}
          title="MCP-varumärkesdata"
          description="SEO-översikt och domänuppslag för din registrerade webbplats."
        />
      </m.div>
      ) : null}

      {websiteUrl && brandTab === "overview" ? (
        <div className="app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4">
        <m.div {...pageFadeUp} className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Primär webbplats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Globe2 className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">{hostname || websiteUrl}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" asChild>
                  <a href={websiteUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="sr-only">Öppna webbplatsen</span>
                  </a>
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {audit
                  ? `${audit.auditSource === "pagespeed" ? "PageSpeed Insights + HTML-audit" : "HTML fallback-audit"} för ${audit.finalUrl} ${formatDateTimeMedium(audit.checkedAt)}.`
                  : auditLoading
                    ? "Kör PageSpeed Insights och hämtar HTML, robots.txt och sitemap.xml…"
                    : "Kör en audit för att hämta live SEO- och prestandavärden från webbplatsen."}
              </p>
              {audit?.pageSpeed?.error ? (
                <p className="text-xs leading-relaxed text-warning">
                  PageSpeed-meddelande: {audit.pageSpeed.error}
                </p>
              ) : null}
              {audit?.htmlFallbackError ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  HTML fallback-meddelande: {audit.htmlFallbackError}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Varumärkesberedskap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-semibold tabular-nums">{readinessScore}%</span>
                <span className="text-xs text-muted-foreground">
                  {auditLoading ? "Granskar…" : `${highCount} högprioriterad${highCount === 1 ? "" : "a"} punkt${highCount === 1 ? "" : "er"}`}
                </span>
              </div>
              <Progress value={readinessScore} className="h-2" />
              {highCount > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setBrandTab("recs")}>
                  Öppna rekommendationer
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </m.div>

      {audit ? (
        <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mobilePageSpeed ? (
            <>
              <MetricCard title="Mobil PageSpeed" value={scoreLabel(mobilePageSpeed.scores.performance)} hint="Lighthouse prestandapoäng från PageSpeed Insights." icon={Gauge} />
              <MetricCard title="Mobil SEO" value={scoreLabel(mobilePageSpeed.scores.seo)} hint="Lighthouse SEO-poäng från PageSpeed Insights." icon={Search} />
              <MetricCard title="Mobil LCP" value={metricDisplay(mobilePageSpeed.metrics.largestContentfulPaint)} hint="Largest Contentful Paint från Lighthouse." icon={RefreshCw} />
              <MetricCard title="Mobil CLS" value={metricDisplay(mobilePageSpeed.metrics.cumulativeLayoutShift)} hint="Cumulative Layout Shift från Lighthouse." icon={ShieldCheck} />
            </>
          ) : (
            <>
              <MetricCard title="HTTP-status" value={String(audit.status)} hint={audit.ok ? "Startsidan är nåbar." : "Startsidan returnerade fel."} icon={Gauge} />
              <MetricCard title="Svarstid" value={`${audit.responseTimeMs} ms`} hint="Mätt av server-side audit-hämtningen." icon={RefreshCw} />
              <MetricCard title="Titelns längd" value={`${audit.titleLength} tecken`} hint={audit.title || "Ingen title-tagg hittades."} icon={Search} />
              <MetricCard title="Metabeskrivning" value={`${audit.metaDescriptionLength} tecken`} hint={audit.metaDescription || "Ingen metabeskrivning hittades."} icon={FileText} />
            </>
          )}
        </div>
        {showAllBrandMetrics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {desktopPageSpeed ? (
            <>
              <MetricCard title="Desktop PageSpeed" value={scoreLabel(desktopPageSpeed.scores.performance)} hint="Lighthouse prestandapoäng (desktop) från PageSpeed Insights." icon={Gauge} />
              <MetricCard title="Tillgänglighet" value={scoreLabel(desktopPageSpeed.scores.accessibility)} hint="Lighthouse tillgänglighetspoäng (desktop)." icon={ShieldCheck} />
              <MetricCard title="Bästa praxis" value={scoreLabel(desktopPageSpeed.scores.bestPractices)} hint="Lighthouse poäng för implementeringskvalitet (desktop)." icon={CheckCircle2} />
              <MetricCard title="Desktop LCP" value={metricDisplay(desktopPageSpeed.metrics.largestContentfulPaint)} hint="Largest Contentful Paint (desktop)." icon={RefreshCw} />
            </>
          ) : null}
          {mobilePageSpeed ? (
            <>
              <MetricCard title="HTTP-status" value={String(audit.status)} hint={audit.ok ? "Startsidan är nåbar." : "Startsidan returnerade fel."} icon={Gauge} />
              <MetricCard title="Svarstid" value={`${audit.responseTimeMs} ms`} hint="Mätt av server-side audit-hämtningen." icon={RefreshCw} />
              <MetricCard title="Titelns längd" value={`${audit.titleLength} tecken`} hint={audit.title || "Ingen title-tagg hittades."} icon={Search} />
              <MetricCard title="Metabeskrivning" value={`${audit.metaDescriptionLength} tecken`} hint={audit.metaDescription || "Ingen metabeskrivning hittades."} icon={FileText} />
            </>
          ) : null}
          <MetricCard title="Antal H1" value={String(audit.h1Texts.length)} hint={audit.h1Texts[0] || "Ingen H1 hittades."} icon={CheckCircle2} />
          <MetricCard title="Strukturerad data" value={String(audit.structuredDataCount)} hint="JSON-LD-block hittade i HTML." icon={ShieldCheck} />
          <MetricCard title="Bilder utan alt" value={`${audit.imagesMissingAlt}/${audit.imageCount}`} hint="Baserat på img-taggar i hämtad HTML." icon={FileText} />
          <MetricCard title="Sitemap-status" value={statusLabel(audit.sitemapXmlStatus)} hint="Svar vid kontroll av /sitemap.xml." icon={Globe2} />
        </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground"
          onClick={() => setShowAllBrandMetrics((v) => !v)}
        >
          {showAllBrandMetrics ? "Visa färre mätvärden" : "Visa alla mätvärden"}
        </Button>
        </div>
      ) : auditLoading ? (
        <Card className="border-border">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Granskar webbplatsen…
          </CardContent>
        </Card>
      ) : null}
        </div>
      ) : null}

      {websiteUrl && brandTab === "recs" ? (
        <div className="app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4">
      <Tabs value={recArea} onValueChange={(v) => setRecArea(v as RecAreaTab)} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="performance">Prestanda</TabsTrigger>
          <TabsTrigger value="trust">Förtroende</TabsTrigger>
          <TabsTrigger value="channels">Kanaler</TabsTrigger>
          <TabsTrigger value="all">Alla</TabsTrigger>
        </TabsList>

        {(["seo", "performance", "trust", "channels"] as RecommendationArea[]).map((area) => (
          <TabsContent key={area} value={area} className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{AREA_LABELS[area]}-resultat</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {recsFor(area).map((recommendation) => (
                <RecommendationCard key={`${recommendation.area}-${recommendation.title}`} recommendation={recommendation} />
              ))}
            </div>
          </TabsContent>
        ))}

        <TabsContent value="all" className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Alla resultat</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((recommendation) => (
              <RecommendationCard key={`${recommendation.area}-${recommendation.title}`} recommendation={recommendation} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
        </div>
      ) : null}
    </div>
  );
}
