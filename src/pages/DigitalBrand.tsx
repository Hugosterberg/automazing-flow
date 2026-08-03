import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
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
import { t } from "@/lib/i18n";

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

/** Translated recommendation area label (follows active UI language). */
function areaLabel(area: RecommendationArea): string {
  return t(`digitalBrand:areas.${area}`);
}

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
  if (bytes >= 1024 * 1024) {
    return t("digitalBrand:helpers.bytesMb", { value: (bytes / 1024 / 1024).toFixed(1) });
  }
  if (bytes >= 1024) return t("digitalBrand:helpers.bytesKb", { value: Math.round(bytes / 1024) });
  return t("digitalBrand:helpers.bytesB", { value: bytes });
}

function statusLabel(status: number | null) {
  return status == null ? t("digitalBrand:helpers.notFound") : String(status);
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
  return score == null ? t("digitalBrand:helpers.noData") : t("digitalBrand:helpers.scoreFormat", { score });
}

function metricDisplay(metric: PageSpeedMetric | undefined) {
  if (!metric) return t("digitalBrand:helpers.noData");
  return (
    metric.displayValue ||
    (metric.numericValue != null ? String(Math.round(metric.numericValue)) : t("digitalBrand:helpers.noData"))
  );
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
        title: t("digitalBrand:recommendations.registerWebsite.title"),
        value: t("digitalBrand:helpers.noUrl"),
        detail: t("digitalBrand:recommendations.registerWebsite.detail", {
          connections: t("common:nav.connections"),
        }),
      },
    ];
  }
  if (!audit) return [];

  const hasGoogleBusiness =
    connectedPlatforms.has("google_business") || connectedPlatforms.has("google_reviews");
  const hasReviews =
    connectedPlatforms.has("google_reviews") ||
    connectedPlatforms.has("tripadvisor") ||
    connectedPlatforms.has("judgeme");
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
          title: t("digitalBrand:recommendations.pageSpeedScore.title"),
          value: scoreLabel(mobilePsi?.scores.performance ?? desktopPsi?.scores.performance),
          detail: mobilePsi
            ? t("digitalBrand:recommendations.pageSpeedScore.detailMobileDesktop", {
                mobileScore: scoreLabel(mobilePsi.scores.performance),
                desktopScore: scoreLabel(desktopPsi?.scores.performance),
              })
            : t("digitalBrand:recommendations.pageSpeedScore.detailDesktopOnly", {
                desktopScore: scoreLabel(desktopPsi?.scores.performance),
              }),
        }
      : {
          area: "performance",
          priority: "medium",
          title: t("digitalBrand:recommendations.pageSpeedUnavailable.title"),
          value: audit.pageSpeed?.apiKeyConfigured
            ? t("digitalBrand:recommendations.pageSpeedUnavailable.valueNoResult")
            : t("digitalBrand:recommendations.pageSpeedUnavailable.valueNoApiKey"),
          detail:
            audit.pageSpeed?.error || t("digitalBrand:recommendations.pageSpeedUnavailable.detailFallback"),
        },
    primaryPsi
      ? {
          area: "seo",
          priority: scorePriority(mobilePsi?.scores.seo ?? desktopPsi?.scores.seo),
          title: t("digitalBrand:recommendations.lighthouseSeoScore.title"),
          value: scoreLabel(mobilePsi?.scores.seo ?? desktopPsi?.scores.seo),
          detail: t("digitalBrand:recommendations.lighthouseSeoScore.detail"),
        }
      : null,
    primaryPsi
      ? {
          area: "trust",
          priority: scorePriority(mobilePsi?.scores.accessibility ?? desktopPsi?.scores.accessibility),
          title: t("digitalBrand:recommendations.accessibilityScore.title"),
          value: scoreLabel(mobilePsi?.scores.accessibility ?? desktopPsi?.scores.accessibility),
          detail: t("digitalBrand:recommendations.accessibilityScore.detail"),
        }
      : null,
    primaryPsi
      ? {
          area: "trust",
          priority: scorePriority(mobilePsi?.scores.bestPractices ?? desktopPsi?.scores.bestPractices),
          title: t("digitalBrand:recommendations.bestPracticesScore.title"),
          value: scoreLabel(mobilePsi?.scores.bestPractices ?? desktopPsi?.scores.bestPractices),
          detail: t("digitalBrand:recommendations.bestPracticesScore.detail"),
        }
      : null,
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.metrics.largestContentfulPaint.score ?? desktopPsi?.metrics.largestContentfulPaint.score),
          title: t("digitalBrand:recommendations.lcp.title"),
          value: metricDisplay(mobilePsi?.metrics.largestContentfulPaint ?? desktopPsi?.metrics.largestContentfulPaint),
          detail: t("digitalBrand:recommendations.lcp.detail"),
        }
      : null,
    primaryPsi
      ? {
          area: "performance",
          priority: scorePriority(mobilePsi?.metrics.cumulativeLayoutShift.score ?? desktopPsi?.metrics.cumulativeLayoutShift.score),
          title: t("digitalBrand:recommendations.cls.title"),
          value: metricDisplay(mobilePsi?.metrics.cumulativeLayoutShift ?? desktopPsi?.metrics.cumulativeLayoutShift),
          detail: t("digitalBrand:recommendations.cls.detail"),
        }
      : null,
    {
      area: "performance",
      priority: priorityForPass(audit.ok),
      title: t("digitalBrand:recommendations.homepageHttpStatus.title"),
      value: `${audit.status}`,
      detail: audit.ok
        ? t("digitalBrand:recommendations.homepageHttpStatus.detailOk", { status: audit.status })
        : t("digitalBrand:recommendations.homepageHttpStatus.detailFail", { status: audit.status }),
    },
    {
      area: "performance",
      priority: priorityForPass(audit.responseTimeMs <= 1200, audit.responseTimeMs <= 2500),
      title: t("digitalBrand:recommendations.serverResponseTime.title"),
      value: t("digitalBrand:helpers.milliseconds", { ms: audit.responseTimeMs }),
      detail:
        audit.responseTimeMs <= 1200
          ? t("digitalBrand:recommendations.serverResponseTime.detailOk")
          : t("digitalBrand:recommendations.serverResponseTime.detailSlow"),
    },
    {
      area: "performance",
      priority: priorityForPass(audit.pageSizeBytes <= 350_000, audit.pageSizeBytes <= 900_000),
      title: t("digitalBrand:recommendations.htmlDownloadSize.title"),
      value: bytesLabel(audit.pageSizeBytes),
      detail:
        audit.pageSizeBytes <= 350_000
          ? t("digitalBrand:recommendations.htmlDownloadSize.detailOk")
          : t("digitalBrand:recommendations.htmlDownloadSize.detailLarge"),
    },
    {
      area: "seo",
      priority: priorityForPass(titleOk, Boolean(audit.title)),
      title: t("digitalBrand:recommendations.titleTagLength.title"),
      value: audit.title ? t("digitalBrand:helpers.characters", { count: audit.titleLength }) : t("digitalBrand:helpers.missing"),
      detail: audit.title
        ? t("digitalBrand:recommendations.titleTagLength.detailPresent", { title: audit.title })
        : t("digitalBrand:recommendations.titleTagLength.detailMissing"),
    },
    {
      area: "seo",
      priority: priorityForPass(metaOk, Boolean(audit.metaDescription)),
      title: t("digitalBrand:recommendations.metaDescription.title"),
      value: audit.metaDescription
        ? t("digitalBrand:helpers.characters", { count: audit.metaDescriptionLength })
        : t("digitalBrand:helpers.missing"),
      detail: audit.metaDescription
        ? t("digitalBrand:recommendations.metaDescription.detailPresent", { count: audit.metaDescriptionLength })
        : t("digitalBrand:recommendations.metaDescription.detailMissing"),
    },
    {
      area: "seo",
      priority: priorityForPass(h1Ok, audit.h1Texts.length > 0),
      title: t("digitalBrand:recommendations.h1Structure.title"),
      value: t("digitalBrand:helpers.h1Count", { count: audit.h1Texts.length }),
      detail:
        audit.h1Texts.length === 1
          ? t("digitalBrand:recommendations.h1Structure.detailSingle", { h1: audit.h1Texts[0] })
          : t("digitalBrand:recommendations.h1Structure.detailMultiple"),
    },
    {
      area: "seo",
      priority: priorityForPass(Boolean(audit.canonical), true),
      title: t("digitalBrand:recommendations.canonicalUrl.title"),
      value: audit.canonical ? t("digitalBrand:helpers.present") : t("digitalBrand:helpers.missing"),
      detail: audit.canonical
        ? t("digitalBrand:recommendations.canonicalUrl.detailPresent", { canonical: audit.canonical })
        : t("digitalBrand:recommendations.canonicalUrl.detailMissing"),
    },
    {
      area: "seo",
      priority: priorityForPass(audit.structuredDataCount > 0, true),
      title: t("digitalBrand:recommendations.structuredData.title"),
      value: t("digitalBrand:helpers.jsonLdBlocks", { count: audit.structuredDataCount }),
      detail:
        audit.structuredDataCount > 0
          ? t("digitalBrand:recommendations.structuredData.detailPresent")
          : t("digitalBrand:recommendations.structuredData.detailMissing"),
    },
    {
      area: "seo",
      priority: priorityForPass(audit.sitemapXmlStatus != null && audit.sitemapXmlStatus < 400, true),
      title: t("digitalBrand:recommendations.sitemapCheck.title"),
      value: statusLabel(audit.sitemapXmlStatus),
      detail:
        audit.sitemapXmlStatus != null && audit.sitemapXmlStatus < 400
          ? t("digitalBrand:recommendations.sitemapCheck.detailOk")
          : t("digitalBrand:recommendations.sitemapCheck.detailMissing"),
    },
    {
      area: "trust",
      priority: priorityForPass(websiteUrl.startsWith("https://")),
      title: t("digitalBrand:recommendations.https.title"),
      value: websiteUrl.startsWith("https://") ? t("digitalBrand:helpers.https") : t("digitalBrand:helpers.http"),
      detail: websiteUrl.startsWith("https://")
        ? t("digitalBrand:recommendations.https.detailOk")
        : t("digitalBrand:recommendations.https.detailHttp"),
    },
    {
      area: "trust",
      priority: priorityForPass(Boolean(audit.viewport), true),
      title: t("digitalBrand:recommendations.mobileViewport.title"),
      value: audit.viewport ? t("digitalBrand:helpers.present") : t("digitalBrand:helpers.missing"),
      detail: audit.viewport
        ? t("digitalBrand:recommendations.mobileViewport.detailPresent", { viewport: audit.viewport })
        : t("digitalBrand:recommendations.mobileViewport.detailMissing"),
    },
    {
      area: "trust",
      priority: priorityForPass(altMissingRate <= 0.15, altMissingRate <= 0.35),
      title: t("digitalBrand:recommendations.imageAltText.title"),
      value: t("digitalBrand:helpers.imagesMissing", {
        missing: audit.imagesMissingAlt,
        total: audit.imageCount,
      }),
      detail:
        audit.imageCount === 0
          ? t("digitalBrand:recommendations.imageAltText.detailNoImages")
          : t("digitalBrand:recommendations.imageAltText.detailMissing"),
    },
    {
      area: "trust",
      priority: priorityForPass(Boolean(audit.ogTitle && audit.ogDescription), true),
      title: t("digitalBrand:recommendations.socialPreview.title"),
      value:
        audit.ogTitle && audit.ogDescription
          ? t("digitalBrand:helpers.complete")
          : t("digitalBrand:helpers.incomplete"),
      detail:
        audit.ogTitle && audit.ogDescription
          ? t("digitalBrand:recommendations.socialPreview.detailComplete")
          : t("digitalBrand:recommendations.socialPreview.detailIncomplete"),
    },
    {
      area: "channels",
      priority: priorityForPass(hasGoogleBusiness, true),
      title: t("digitalBrand:recommendations.googleBusinessConnection.title"),
      value: hasGoogleBusiness ? t("digitalBrand:helpers.connected") : t("digitalBrand:helpers.notConnected"),
      detail: hasGoogleBusiness
        ? t("digitalBrand:recommendations.googleBusinessConnection.detailConnected")
        : t("digitalBrand:recommendations.googleBusinessConnection.detailNotConnected"),
    },
    {
      area: "channels",
      priority: priorityForPass(hasReviews, true),
      title: t("digitalBrand:recommendations.reviewSources.title"),
      value: hasReviews ? t("digitalBrand:helpers.connected") : t("digitalBrand:helpers.notConnected"),
      detail: hasReviews
        ? t("digitalBrand:recommendations.reviewSources.detailConnected")
        : t("digitalBrand:recommendations.reviewSources.detailNotConnected"),
    },
    {
      area: "channels",
      priority: priorityForPass(hasSocial, true),
      title: t("digitalBrand:recommendations.socialChannels.title"),
      value: hasSocial ? t("digitalBrand:helpers.connected") : t("digitalBrand:helpers.notConnected"),
      detail: hasSocial
        ? t("digitalBrand:recommendations.socialChannels.detailConnected")
        : t("digitalBrand:recommendations.socialChannels.detailNotConnected"),
    },
    {
      area: "channels",
      priority: priorityForPass(hasAds, true),
      title: t("digitalBrand:recommendations.paidMediaChannels.title"),
      value: hasAds ? t("digitalBrand:helpers.connected") : t("digitalBrand:helpers.notConnected"),
      detail: hasAds
        ? t("digitalBrand:recommendations.paidMediaChannels.detailConnected")
        : t("digitalBrand:recommendations.paidMediaChannels.detailNotConnected"),
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
    throw new Error(payload?.message || payload?.error || t("digitalBrand:errors.auditFailed"));
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
              {t(`digitalBrand:priority.${recommendation.priority}`)}
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
  const { t, i18n } = useTranslation("digitalBrand");
  const { t: tCommon } = useTranslation("common");
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
      setAuditError(error instanceof Error ? error.message : t("errors.auditFailed"));
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
    [websiteUrl, audit, connectedPlatforms, i18n.language]
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
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <div className="flex flex-wrap gap-2">
            {websiteUrl ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void runAudit()} disabled={auditLoading}>
                {auditLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("page.refreshAudit")}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to="/company">
                <Globe2 className="mr-1.5 h-3.5 w-3.5" />
                {t("page.editWebsite")}
              </Link>
            </Button>
          </div>
        }
      />

      <PageSmartBar
        title={t("smartBar.title")}
        steps={[t("smartBar.step1"), t("smartBar.step2"), t("smartBar.step3")]}
        tip={t("smartBar.tip")}
        liveHintOverride={
          !websiteUrl
            ? t("smartBar.liveHintNoWebsite")
            : highCount > 0
              ? t("smartBar.liveHintHighPriority", { count: highCount })
              : audit
                ? t("smartBar.liveHintOk")
                : null
        }
        extraActions={
          highCount > 0 ? [{ label: t("smartBar.actionShowRecs"), onClick: () => setBrandTab("recs") }] : []
        }
      />

      <PageModeTabs
        value={brandTab}
        aria-label={t("tabs.ariaLabel")}
        onChange={setBrandTab}
        options={[
          { value: "overview", label: t("tabs.overview") },
          { value: "recs", label: t("tabs.recs"), count: highCount },
          { value: "research", label: t("tabs.research") },
        ]}
      />

      {!websiteUrl ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("alerts.noWebsiteTitle")}</AlertTitle>
          <AlertDescription>
            {t("alerts.noWebsiteDescPrefix")}{" "}
            <Link to="/company" className="text-primary underline underline-offset-2">
              {tCommon("nav.company")}
            </Link>{" "}
            {t("alerts.noWebsiteDescSuffix")}
          </AlertDescription>
        </Alert>
      ) : auditError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("alerts.auditErrorTitle")}</AlertTitle>
          <AlertDescription>{auditError}</AlertDescription>
        </Alert>
      ) : null}

      {brandTab === "research" ? (
      <m.div {...pageFadeUp} className="space-y-4">
        <McpMultiSourceCompare businessProfileId={businessProfileId} initialSubject={hostname ?? ""} />
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS["digital-brand"]}
          title={t("research.mcpTitle")}
          description={t("research.mcpDescription")}
        />
      </m.div>
      ) : null}

      {websiteUrl && brandTab === "overview" ? (
        <div className="app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4">
        <m.div {...pageFadeUp} className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("overview.primaryWebsite")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Globe2 className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">{hostname || websiteUrl}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" asChild>
                  <a href={websiteUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="sr-only">{t("overview.openWebsiteSr")}</span>
                  </a>
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {audit
                  ? t(audit.auditSource === "pagespeed" ? "overview.auditDonePagespeed" : "overview.auditDoneHtmlFallback", {
                      url: audit.finalUrl,
                      checkedAt: formatDateTimeMedium(audit.checkedAt),
                    })
                  : auditLoading
                    ? t("overview.auditLoading")
                    : t("overview.auditIdle")}
              </p>
              {audit?.pageSpeed?.error ? (
                <p className="text-xs leading-relaxed text-warning">
                  {t("overview.pageSpeedMessage", { message: audit.pageSpeed.error })}
                </p>
              ) : null}
              {audit?.htmlFallbackError ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("overview.htmlFallbackMessage", { message: audit.htmlFallbackError })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("overview.readiness")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-semibold tabular-nums">{readinessScore}%</span>
                <span className="text-xs text-muted-foreground">
                  {auditLoading ? t("overview.auditing") : t("overview.highPriorityPoints", { count: highCount })}
                </span>
              </div>
              <Progress value={readinessScore} className="h-2" />
              {highCount > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setBrandTab("recs")}>
                  {t("overview.openRecs")}
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
              <MetricCard title={t("metrics.mobilePageSpeed")} value={scoreLabel(mobilePageSpeed.scores.performance)} hint={t("metrics.mobilePageSpeedHint")} icon={Gauge} />
              <MetricCard title={t("metrics.mobileSeo")} value={scoreLabel(mobilePageSpeed.scores.seo)} hint={t("metrics.mobileSeoHint")} icon={Search} />
              <MetricCard title={t("metrics.mobileLcp")} value={metricDisplay(mobilePageSpeed.metrics.largestContentfulPaint)} hint={t("metrics.mobileLcpHint")} icon={RefreshCw} />
              <MetricCard title={t("metrics.mobileCls")} value={metricDisplay(mobilePageSpeed.metrics.cumulativeLayoutShift)} hint={t("metrics.mobileClsHint")} icon={ShieldCheck} />
            </>
          ) : (
            <>
              <MetricCard title={t("metrics.httpStatus")} value={String(audit.status)} hint={audit.ok ? t("metrics.httpStatusHintOk") : t("metrics.httpStatusHintFail")} icon={Gauge} />
              <MetricCard title={t("metrics.responseTime")} value={t("helpers.milliseconds", { ms: audit.responseTimeMs })} hint={t("metrics.responseTimeHint")} icon={RefreshCw} />
              <MetricCard title={t("metrics.titleLength")} value={t("helpers.characters", { count: audit.titleLength })} hint={audit.title || t("metrics.titleLengthHintNone")} icon={Search} />
              <MetricCard title={t("metrics.metaDescription")} value={t("helpers.characters", { count: audit.metaDescriptionLength })} hint={audit.metaDescription || t("metrics.metaDescriptionHintNone")} icon={FileText} />
            </>
          )}
        </div>
        {showAllBrandMetrics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {desktopPageSpeed ? (
            <>
              <MetricCard title={t("metrics.desktopPageSpeed")} value={scoreLabel(desktopPageSpeed.scores.performance)} hint={t("metrics.desktopPageSpeedHint")} icon={Gauge} />
              <MetricCard title={t("metrics.accessibility")} value={scoreLabel(desktopPageSpeed.scores.accessibility)} hint={t("metrics.accessibilityHint")} icon={ShieldCheck} />
              <MetricCard title={t("metrics.bestPractices")} value={scoreLabel(desktopPageSpeed.scores.bestPractices)} hint={t("metrics.bestPracticesHint")} icon={CheckCircle2} />
              <MetricCard title={t("metrics.desktopLcp")} value={metricDisplay(desktopPageSpeed.metrics.largestContentfulPaint)} hint={t("metrics.desktopLcpHint")} icon={RefreshCw} />
            </>
          ) : null}
          {mobilePageSpeed ? (
            <>
              <MetricCard title={t("metrics.httpStatus")} value={String(audit.status)} hint={audit.ok ? t("metrics.httpStatusHintOk") : t("metrics.httpStatusHintFail")} icon={Gauge} />
              <MetricCard title={t("metrics.responseTime")} value={t("helpers.milliseconds", { ms: audit.responseTimeMs })} hint={t("metrics.responseTimeHint")} icon={RefreshCw} />
              <MetricCard title={t("metrics.titleLength")} value={t("helpers.characters", { count: audit.titleLength })} hint={audit.title || t("metrics.titleLengthHintNone")} icon={Search} />
              <MetricCard title={t("metrics.metaDescription")} value={t("helpers.characters", { count: audit.metaDescriptionLength })} hint={audit.metaDescription || t("metrics.metaDescriptionHintNone")} icon={FileText} />
            </>
          ) : null}
          <MetricCard title={t("metrics.h1Count")} value={String(audit.h1Texts.length)} hint={audit.h1Texts[0] || t("metrics.h1CountHintNone")} icon={CheckCircle2} />
          <MetricCard title={t("metrics.structuredData")} value={String(audit.structuredDataCount)} hint={t("metrics.structuredDataHint")} icon={ShieldCheck} />
          <MetricCard title={t("metrics.imagesMissingAlt")} value={`${audit.imagesMissingAlt}/${audit.imageCount}`} hint={t("metrics.imagesMissingAltHint")} icon={FileText} />
          <MetricCard title={t("metrics.sitemapStatus")} value={statusLabel(audit.sitemapXmlStatus)} hint={t("metrics.sitemapStatusHint")} icon={Globe2} />
        </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground"
          onClick={() => setShowAllBrandMetrics((v) => !v)}
        >
          {showAllBrandMetrics ? t("metrics.showFewer") : t("metrics.showAll")}
        </Button>
        </div>
      ) : auditLoading ? (
        <Card className="border-border">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("overview.auditingWebsite")}
          </CardContent>
        </Card>
      ) : null}
        </div>
      ) : null}

      {websiteUrl && brandTab === "recs" ? (
        <div className="app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4">
      <Tabs value={recArea} onValueChange={(v) => setRecArea(v as RecAreaTab)} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="seo">{areaLabel("seo")}</TabsTrigger>
          <TabsTrigger value="performance">{areaLabel("performance")}</TabsTrigger>
          <TabsTrigger value="trust">{areaLabel("trust")}</TabsTrigger>
          <TabsTrigger value="channels">{areaLabel("channels")}</TabsTrigger>
          <TabsTrigger value="all">{t("areas.all")}</TabsTrigger>
        </TabsList>

        {(["seo", "performance", "trust", "channels"] as RecommendationArea[]).map((area) => (
          <TabsContent key={area} value={area} className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t("recs.areaResults", { area: areaLabel(area) })}</h2>
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
            <h2 className="text-sm font-semibold">{t("recs.allResults")}</h2>
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
