import { Link } from "react-router-dom";
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
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, McpMultiSourceCompare, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { apiUrl } from "@/lib/apiBase";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
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
  return status == null ? "Not found" : String(status);
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
  return score == null ? "No data" : `${score}/100`;
}

function metricDisplay(metric: PageSpeedMetric | undefined) {
  if (!metric) return "No data";
  return metric.displayValue || (metric.numericValue != null ? String(Math.round(metric.numericValue)) : "No data");
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
        title: "Register your primary website",
        value: "No URL",
        detail: "Add the canonical website URL in Connections before running a Digital Brand audit.",
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
          title: "PageSpeed performance score",
          value: scoreLabel(mobilePsi?.scores.performance ?? desktopPsi?.scores.performance),
          detail: mobilePsi
            ? `Mobile Lighthouse performance is ${scoreLabel(mobilePsi.scores.performance)}. Desktop is ${scoreLabel(desktopPsi?.scores.performance)}.`
            : `Desktop Lighthouse performance is ${scoreLabel(desktopPsi?.scores.performance)}.`,
        }
      : {
          area: "performance",
          priority: "medium",
          title: "PageSpeed Insights unavailable",
          value: audit.pageSpeed?.apiKeyConfigured ? "No PSI result" : "No API key",
          detail: audit.pageSpeed?.error || "Add PAGESPEED_API_KEY or GOOGLE_PAGESPEED_API_KEY to use Lighthouse values.",
        },
    primaryPsi
      ? {
          area: "seo",
          priority: scorePriority(mobilePsi?.scores.seo ?? desktopPsi?.scores.seo),
          title: "Lighthouse SEO score",
          value: scoreLabel(mobilePsi?.scores.seo ?? desktopPsi?.scores.seo),
          detail:
            "This is the real Lighthouse SEO category score from PageSpeed Insights for the registered URL.",
        }
      : null,
    primaryPsi
      ? {
          area: "trust",
          priority: scorePriority(mobilePsi?.scores.accessibility ?? desktopPsi?.scores.accessibility),
          title: "Accessibility score",
          value: scoreLabel(mobilePsi?.scores.accessibility ?? desktopPsi?.scores.accessibility),
          detail:
            "Accessibility issues often also hurt conversion, usability, and perceived brand quality.",
        }
      : null,
    primaryPsi
      ? {
          area: "trust",
          priority: scorePriority(mobilePsi?.scores.bestPractices ?? desktopPsi?.scores.bestPractices),
          title: "Best practices score",
          value: scoreLabel(mobilePsi?.scores.bestPractices ?? desktopPsi?.scores.bestPractices),
          detail:
            "Lighthouse best-practices checks cover security, browser compatibility, and implementation quality signals.",
        }
      : null,
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.metrics.largestContentfulPaint.score ?? desktopPsi?.metrics.largestContentfulPaint.score),
          title: "Largest Contentful Paint",
          value: metricDisplay(mobilePsi?.metrics.largestContentfulPaint ?? desktopPsi?.metrics.largestContentfulPaint),
          detail:
            "LCP measures how quickly the main visible content loads. Optimize hero media, server response, and render-blocking resources.",
        }
      : null,
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.metrics.cumulativeLayoutShift.score ?? desktopPsi?.metrics.cumulativeLayoutShift.score),
          title: "Cumulative Layout Shift",
          value: metricDisplay(mobilePsi?.metrics.cumulativeLayoutShift ?? desktopPsi?.metrics.cumulativeLayoutShift),
          detail:
            "CLS measures visual stability. Reserve image/ad space and avoid late-loading UI that pushes content around.",
        }
      : null,
    {
      area: "performance",
      priority: priorityForPass(audit.ok),
      title: "Homepage response status",
      value: `${audit.status}`,
      detail: audit.ok
        ? `The homepage returned HTTP ${audit.status}.`
        : `The homepage returned HTTP ${audit.status}; fix this before optimizing SEO content.`,
    },
    {
      area: "performance",
      priority: priorityForPass(audit.responseTimeMs <= 1200, audit.responseTimeMs <= 2500),
      title: "Server response time",
      value: `${audit.responseTimeMs} ms`,
      detail:
        audit.responseTimeMs <= 1200
          ? "Initial server response is in a healthy range."
          : "Reduce redirects, server work, and blocking upstream calls to improve the initial response.",
    },
    {
      area: "performance",
      priority: priorityForPass(audit.pageSizeBytes <= 350_000, audit.pageSizeBytes <= 900_000),
      title: "Downloaded HTML size",
      value: bytesLabel(audit.pageSizeBytes),
      detail:
        audit.pageSizeBytes <= 350_000
          ? "The HTML payload is reasonably small."
          : "The HTML payload is large; reduce inline scripts, embedded data, and unused markup.",
    },
    {
      area: "seo",
      priority: priorityForPass(titleOk, Boolean(audit.title)),
      title: "Title tag length",
      value: audit.title ? `${audit.titleLength} chars` : "Missing",
      detail: audit.title
        ? `Current title: "${audit.title}". Aim for a descriptive 25-65 character title.`
        : "Add a unique title tag that names the brand, offer, and main search intent.",
    },
    {
      area: "seo",
      priority: priorityForPass(metaOk, Boolean(audit.metaDescription)),
      title: "Meta description",
      value: audit.metaDescription ? `${audit.metaDescriptionLength} chars` : "Missing",
      detail: audit.metaDescription
        ? `Current meta description length is ${audit.metaDescriptionLength} characters. Aim for 70-160.`
        : "Add a meta description that summarizes the offer and gives searchers a reason to click.",
    },
    {
      area: "seo",
      priority: priorityForPass(h1Ok, audit.h1Texts.length > 0),
      title: "H1 structure",
      value: `${audit.h1Texts.length} H1`,
      detail:
        audit.h1Texts.length === 1
          ? `Primary H1: "${audit.h1Texts[0]}".`
          : "Use exactly one clear H1 on the homepage so search engines and users understand the page topic.",
    },
    {
      area: "seo",
      priority: priorityForPass(Boolean(audit.canonical), true),
      title: "Canonical URL",
      value: audit.canonical ? "Present" : "Missing",
      detail: audit.canonical
        ? `Canonical points to ${audit.canonical}.`
        : "Add a canonical URL to prevent duplicate homepage variants from competing in search.",
    },
    {
      area: "seo",
      priority: priorityForPass(audit.structuredDataCount > 0, true),
      title: "Structured data",
      value: `${audit.structuredDataCount} JSON-LD block${audit.structuredDataCount === 1 ? "" : "s"}`,
      detail:
        audit.structuredDataCount > 0
          ? "Structured data is present on the page."
          : "Add Organization, LocalBusiness, FAQ, Product, or Review schema where relevant.",
    },
    {
      area: "seo",
      priority: priorityForPass(audit.sitemapXmlStatus != null && audit.sitemapXmlStatus < 400, true),
      title: "Sitemap probe",
      value: statusLabel(audit.sitemapXmlStatus),
      detail:
        audit.sitemapXmlStatus != null && audit.sitemapXmlStatus < 400
          ? "/sitemap.xml is reachable."
          : "Expose /sitemap.xml so search engines can discover important pages faster.",
    },
    {
      area: "trust",
      priority: priorityForPass(websiteUrl.startsWith("https://")),
      title: "HTTPS",
      value: websiteUrl.startsWith("https://") ? "HTTPS" : "HTTP",
      detail: websiteUrl.startsWith("https://")
        ? "The registered website uses HTTPS."
        : "Switch the registered URL to HTTPS and redirect HTTP to HTTPS.",
    },
    {
      area: "trust",
      priority: priorityForPass(Boolean(audit.viewport), true),
      title: "Mobile viewport",
      value: audit.viewport ? "Present" : "Missing",
      detail: audit.viewport
        ? `Viewport meta: ${audit.viewport}.`
        : "Add a viewport meta tag so the site renders predictably on mobile devices.",
    },
    {
      area: "trust",
      priority: priorityForPass(altMissingRate <= 0.15, altMissingRate <= 0.35),
      title: "Image alt text coverage",
      value: `${audit.imagesMissingAlt}/${audit.imageCount} missing`,
      detail:
        audit.imageCount === 0
          ? "No images were detected in the fetched HTML."
          : "Add descriptive alt text to important images and empty alt text to decorative images.",
    },
    {
      area: "trust",
      priority: priorityForPass(Boolean(audit.ogTitle && audit.ogDescription), true),
      title: "Social preview metadata",
      value: audit.ogTitle && audit.ogDescription ? "Complete" : "Incomplete",
      detail:
        audit.ogTitle && audit.ogDescription
          ? "Open Graph title and description are present."
          : "Add Open Graph title and description so shared links render clearly in social channels.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasGoogleBusiness, true),
      title: "Google Business connection",
      value: hasGoogleBusiness ? "Connected" : "Not connected",
      detail: hasGoogleBusiness
        ? "Google Business is connected, so local brand signals can be compared with the website."
        : "Connect Google Business to align website content with maps, categories, hours, and reviews.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasReviews, true),
      title: "Review sources",
      value: hasReviews ? "Connected" : "Not connected",
      detail: hasReviews
        ? "Review sources are connected and can inform trust messaging."
        : "Connect Google Reviews or Tripadvisor to use real review themes in website optimization.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasSocial, true),
      title: "Social channels",
      value: hasSocial ? "Connected" : "Not connected",
      detail: hasSocial
        ? "Social channels are connected and can be checked against website messaging."
        : "Connect active social profiles to compare brand positioning across channels.",
    },
    {
      area: "channels",
      priority: priorityForPass(hasAds, true),
      title: "Paid media channels",
      value: hasAds ? "Connected" : "Not connected",
      detail: hasAds
        ? "Paid channels are connected, useful for landing-page and CTA alignment."
        : "Connect Google Ads or Meta Business before campaign-specific landing-page optimization.",
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
    throw new Error(payload?.message || payload?.error || "Could not audit website.");
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

  async function runAudit() {
    if (!websiteUrl) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      setAudit(await fetchAudit(websiteUrl));
    } catch (error) {
      setAudit(null);
      setAuditError(error instanceof Error ? error.message : "Could not audit website.");
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

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Digital Brand"
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
        title="Digital Brand granskar er webbplats live — SEO, prestanda och förtroende med konkreta rekommendationer."
        steps={[
          "Registrera webbadress under Kopplingar",
          "Kör audit och granska PageSpeed- och HTML-värden",
          "Prioritera höga rekommendationer under flikarna SEO, Prestanda och Trust",
        ]}
        tip="Auditen körs server-side — ingen kod behöver installeras på sidan."
        liveHintOverride={
          !websiteUrl
            ? "Lägg till webbadress under Kopplingar för att köra audit."
            : highCount > 0
              ? `${highCount} högprioriterad${highCount === 1 ? "" : "e"} rekommendation${highCount === 1 ? "" : "er"} — börja under SEO eller Prestanda`
              : audit
                ? "Auditen ser bra ut — inga kritiska punkter just nu."
                : null
        }
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

      <m.div {...pageFadeUp} className="space-y-4">
        <McpMultiSourceCompare businessProfileId={businessProfileId} initialSubject={hostname ?? ""} />
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS["digital-brand"]}
          title="MCP-varumärkesdata"
          description="SEO-översikt och domänuppslag för din registrerade webbplats."
        />
      </m.div>

      {websiteUrl ? (
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
                    <span className="sr-only">Open website</span>
                  </a>
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {audit
                  ? `${audit.auditSource === "pagespeed" ? "PageSpeed Insights + HTML audit" : "HTML fallback audit"} for ${audit.finalUrl} at ${new Date(audit.checkedAt).toLocaleString()}.`
                  : auditLoading
                    ? "Kör PageSpeed Insights och hämtar HTML, robots.txt och sitemap.xml…"
                    : "Kör en audit för att hämta live SEO- och prestandavärden från webbplatsen."}
              </p>
              {audit?.pageSpeed?.error ? (
                <p className="text-xs leading-relaxed text-warning">
                  PageSpeed note: {audit.pageSpeed.error}
                </p>
              ) : null}
              {audit?.htmlFallbackError ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  HTML fallback note: {audit.htmlFallbackError}
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
            </CardContent>
          </Card>
        </m.div>

      {audit ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mobilePageSpeed ? (
            <>
              <MetricCard title="Mobile PageSpeed" value={scoreLabel(mobilePageSpeed.scores.performance)} hint="Lighthouse performance score from PageSpeed Insights." icon={Gauge} />
              <MetricCard title="Mobile SEO" value={scoreLabel(mobilePageSpeed.scores.seo)} hint="Lighthouse SEO score from PageSpeed Insights." icon={Search} />
              <MetricCard title="Mobile LCP" value={metricDisplay(mobilePageSpeed.metrics.largestContentfulPaint)} hint="Largest Contentful Paint from Lighthouse." icon={RefreshCw} />
              <MetricCard title="Mobile CLS" value={metricDisplay(mobilePageSpeed.metrics.cumulativeLayoutShift)} hint="Cumulative Layout Shift from Lighthouse." icon={ShieldCheck} />
            </>
          ) : null}
          {desktopPageSpeed ? (
            <>
              <MetricCard title="Desktop PageSpeed" value={scoreLabel(desktopPageSpeed.scores.performance)} hint="Desktop Lighthouse performance score." icon={Gauge} />
              <MetricCard title="Accessibility" value={scoreLabel(desktopPageSpeed.scores.accessibility)} hint="Desktop Lighthouse accessibility score." icon={ShieldCheck} />
              <MetricCard title="Best practices" value={scoreLabel(desktopPageSpeed.scores.bestPractices)} hint="Desktop Lighthouse implementation-quality score." icon={CheckCircle2} />
              <MetricCard title="Desktop LCP" value={metricDisplay(desktopPageSpeed.metrics.largestContentfulPaint)} hint="Desktop Largest Contentful Paint." icon={RefreshCw} />
            </>
          ) : null}
          <MetricCard title="HTTP status" value={String(audit.status)} hint={audit.ok ? "Homepage is reachable." : "Homepage returned an error."} icon={Gauge} />
          <MetricCard title="Response time" value={`${audit.responseTimeMs} ms`} hint="Measured by the server-side audit fetch." icon={RefreshCw} />
          <MetricCard title="Title length" value={`${audit.titleLength} chars`} hint={audit.title || "No title tag found."} icon={Search} />
          <MetricCard title="Meta description" value={`${audit.metaDescriptionLength} chars`} hint={audit.metaDescription || "No meta description found."} icon={FileText} />
          <MetricCard title="H1 count" value={String(audit.h1Texts.length)} hint={audit.h1Texts[0] || "No H1 found."} icon={CheckCircle2} />
          <MetricCard title="Structured data" value={String(audit.structuredDataCount)} hint="JSON-LD blocks found in HTML." icon={ShieldCheck} />
          <MetricCard title="Images missing alt" value={`${audit.imagesMissingAlt}/${audit.imageCount}`} hint="Based on img tags in fetched HTML." icon={FileText} />
          <MetricCard title="Sitemap status" value={statusLabel(audit.sitemapXmlStatus)} hint="Probe result for /sitemap.xml." icon={Globe2} />
        </div>
      ) : auditLoading ? (
        <Card className="border-border">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Granskar webbplatsen…
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="seo" className="space-y-4">
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
