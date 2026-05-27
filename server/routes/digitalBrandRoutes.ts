import net from "net";

interface DigitalBrandRoutesDeps {
  getSessionUserId: (req: unknown) => string | null;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeAuditUrl(raw: unknown): URL {
  const value = String(raw || "").trim();
  if (!value) throw new Error("missing_url");
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported_protocol");
  if (!url.hostname) throw new Error("missing_hostname");
  url.hash = "";
  return url;
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  if (ipVersion === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  }
  return false;
}

function textBetween(html: string, pattern: RegExp): string {
  return decodeHtml(pattern.exec(html)?.[1] || "").replace(/\s+/g, " ").trim();
}

function attr(html: string, pattern: RegExp): string {
  return decodeHtml(pattern.exec(html)?.[1] || "").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function countMatches(html: string, pattern: RegExp): number {
  return Array.from(html.matchAll(pattern)).length;
}

function extractH1Texts(html: string): string[] {
  return Array.from(html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((match) => decodeHtml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function extractPageFacts(html: string) {
  const title = textBetween(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = attr(
    html,
    /<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i
  );
  const canonical = attr(
    html,
    /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']*)["'])[^>]*>/i
  );
  const robotsMeta = attr(
    html,
    /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i
  );
  const viewport = attr(
    html,
    /<meta\b(?=[^>]*\bname=["']viewport["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i
  );
  const ogTitle = attr(
    html,
    /<meta\b(?=[^>]*\bproperty=["']og:title["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i
  );
  const ogDescription = attr(
    html,
    /<meta\b(?=[^>]*\bproperty=["']og:description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i
  );
  const imageCount = countMatches(html, /<img\b[^>]*>/gi);
  const imagesWithAlt = countMatches(html, /<img\b(?=[^>]*\balt=["'][^"']+["'])[^>]*>/gi);

  return {
    title,
    titleLength: title.length,
    metaDescription,
    metaDescriptionLength: metaDescription.length,
    h1Texts: extractH1Texts(html),
    canonical,
    robotsMeta,
    viewport,
    ogTitle,
    ogDescription,
    structuredDataCount: countMatches(html, /<script\b(?=[^>]*type=["']application\/ld\+json["'])[^>]*>/gi),
    imageCount,
    imagesMissingAlt: Math.max(0, imageCount - imagesWithAlt),
    internalLinkCount: countMatches(html, /<a\b[^>]*href=["'](?:\/|#)[^"']*["'][^>]*>/gi),
  };
}

function getPageSpeedApiKey(): string {
  return String(process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || "").trim();
}

function scoreToPercent(score: unknown): number | null {
  return typeof score === "number" ? Math.round(score * 100) : null;
}

function auditMetric(audits: JsonRecord, id: string) {
  const audit = asRecord(audits[id]);
  const numericValue =
    typeof audit.numericValue === "number"
      ? audit.numericValue
      : typeof audit.score === "number"
        ? audit.score
        : null;
  return {
    score: scoreToPercent(audit.score),
    numericValue,
    displayValue: typeof audit.displayValue === "string" ? audit.displayValue : null,
    title: typeof audit.title === "string" ? audit.title : null,
  };
}

function cruxMetric(metrics: unknown, id: string) {
  const metric = asRecord(asRecord(metrics)[id]);
  if (Object.keys(metric).length === 0) return null;
  return {
    percentile: typeof metric.percentile === "number" ? metric.percentile : null,
    category: typeof metric.category === "string" ? metric.category : null,
  };
}

function normalizePageSpeedResult(body: unknown, strategy: "mobile" | "desktop") {
  const pageSpeed = asRecord(body);
  const lighthouse = asRecord(pageSpeed.lighthouseResult);
  const categories = asRecord(lighthouse.categories);
  const audits = asRecord(lighthouse.audits);
  const loadingExperience = asRecord(pageSpeed.loadingExperience);
  const originLoadingExperience = asRecord(pageSpeed.originLoadingExperience);
  const performance = asRecord(categories.performance);
  const accessibility = asRecord(categories.accessibility);
  const bestPractices = asRecord(categories["best-practices"]);
  const seo = asRecord(categories.seo);

  return {
    strategy,
    requestedUrl: String(lighthouse.requestedUrl || pageSpeed.id || ""),
    finalUrl: String(lighthouse.finalUrl || ""),
    fetchTime: String(lighthouse.fetchTime || ""),
    scores: {
      performance: scoreToPercent(performance.score),
      accessibility: scoreToPercent(accessibility.score),
      bestPractices: scoreToPercent(bestPractices.score),
      seo: scoreToPercent(seo.score),
    },
    metrics: {
      firstContentfulPaint: auditMetric(audits, "first-contentful-paint"),
      largestContentfulPaint: auditMetric(audits, "largest-contentful-paint"),
      cumulativeLayoutShift: auditMetric(audits, "cumulative-layout-shift"),
      totalBlockingTime: auditMetric(audits, "total-blocking-time"),
      speedIndex: auditMetric(audits, "speed-index"),
      interactive: auditMetric(audits, "interactive"),
    },
    seoAudits: {
      title: auditMetric(audits, "document-title"),
      metaDescription: auditMetric(audits, "meta-description"),
      crawlableAnchors: auditMetric(audits, "crawlable-anchors"),
      robotsTxt: auditMetric(audits, "robots-txt"),
      httpStatusCode: auditMetric(audits, "http-status-code"),
      hreflang: auditMetric(audits, "hreflang"),
      canonical: auditMetric(audits, "canonical"),
      fontSize: auditMetric(audits, "font-size"),
      tapTargets: auditMetric(audits, "tap-targets"),
    },
    diagnostics: {
      redirects: auditMetric(audits, "redirects"),
      renderBlockingResources: auditMetric(audits, "render-blocking-resources"),
      unusedJavascript: auditMetric(audits, "unused-javascript"),
      unusedCssRules: auditMetric(audits, "unused-css-rules"),
      modernImageFormats: auditMetric(audits, "modern-image-formats"),
      usesOptimizedImages: auditMetric(audits, "uses-optimized-images"),
      usesResponsiveImages: auditMetric(audits, "uses-responsive-images"),
      serverResponseTime: auditMetric(audits, "server-response-time"),
    },
    crux: {
      url: loadingExperience?.id || null,
      overallCategory: loadingExperience?.overall_category || null,
      metrics: {
        lcp: cruxMetric(loadingExperience.metrics, "LARGEST_CONTENTFUL_PAINT_MS"),
        inp: cruxMetric(loadingExperience.metrics, "INTERACTION_TO_NEXT_PAINT"),
        cls: cruxMetric(loadingExperience.metrics, "CUMULATIVE_LAYOUT_SHIFT_SCORE"),
        fcp: cruxMetric(loadingExperience.metrics, "FIRST_CONTENTFUL_PAINT_MS"),
      },
      originOverallCategory: originLoadingExperience?.overall_category || null,
    },
  };
}

async function runPageSpeed(url: URL, strategy: "mobile" | "desktop") {
  const params = new URLSearchParams({
    url: url.toString(),
    strategy,
    locale: "en",
  });
  for (const category of ["PERFORMANCE", "SEO", "ACCESSIBILITY", "BEST_PRACTICES"]) {
    params.append("category", category);
  }
  const apiKey = getPageSpeedApiKey();
  if (apiKey) params.set("key", apiKey);

  const response = await fetchWithTimeout(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    45_000
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    const message =
      error.message ||
      asRecord(body).error ||
      `PageSpeed Insights failed with HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return normalizePageSpeedResult(body, strategy);
}

async function runPageSpeedAudit(url: URL) {
  const apiKeyConfigured = Boolean(getPageSpeedApiKey());
  const [mobileResult, desktopResult] = await Promise.allSettled([
    runPageSpeed(url, "mobile"),
    runPageSpeed(url, "desktop"),
  ]);
  const mobile = mobileResult.status === "fulfilled" ? mobileResult.value : null;
  const desktop = desktopResult.status === "fulfilled" ? desktopResult.value : null;
  const errors = [mobileResult, desktopResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));

  return {
    apiKeyConfigured,
    mobile,
    desktop,
    error: errors.length > 0 ? errors.join(" | ") : null,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "AutomazingFlowDigitalBrandAudit/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeStatus(url: URL, path: string): Promise<number | null> {
  try {
    const probe = new URL(path, url.origin);
    const res = await fetchWithTimeout(probe.toString(), { method: "GET" }, 5000);
    return res.status;
  } catch {
    return null;
  }
}

async function runHtmlFallbackAudit(url: URL) {
  const started = Date.now();
  const response = await fetchWithTimeout(url.toString());
  const responseTimeMs = Date.now() - started;
  const contentType = response.headers.get("content-type") || "";
  const html = await response.text();
  const limitedHtml = html.slice(0, 1_000_000);
  const facts = /html|xml|text/i.test(contentType) ? extractPageFacts(limitedHtml) : extractPageFacts("");
  const [robotsTxtStatus, sitemapXmlStatus] = await Promise.all([
    probeStatus(url, "/robots.txt"),
    probeStatus(url, "/sitemap.xml"),
  ]);

  return {
    ok: response.ok,
    requestedUrl: url.toString().replace(/\/$/, ""),
    finalUrl: response.url.replace(/\/$/, ""),
    status: response.status,
    responseTimeMs,
    contentType,
    pageSizeBytes: Buffer.byteLength(limitedHtml, "utf8"),
    checkedAt: new Date().toISOString(),
    robotsTxtStatus,
    sitemapXmlStatus,
    ...facts,
  };
}

export function registerDigitalBrandRoutes(app, deps: DigitalBrandRoutesDeps) {
  const { getSessionUserId } = deps;

  app.get("/api/digital-brand/audit", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    let url: URL;
    try {
      url = normalizeAuditUrl(req.query.url);
      if (isPrivateHostname(url.hostname)) {
        return res.status(400).json({ error: "blocked_hostname" });
      }
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "invalid_url",
      });
    }

    const [pageSpeedResult, htmlResult] = await Promise.allSettled([
      runPageSpeedAudit(url),
      runHtmlFallbackAudit(url),
    ]);
    const pageSpeed =
      pageSpeedResult.status === "fulfilled"
        ? pageSpeedResult.value
        : {
            apiKeyConfigured: Boolean(getPageSpeedApiKey()),
            mobile: null,
            desktop: null,
            error:
              pageSpeedResult.reason instanceof Error
                ? pageSpeedResult.reason.message
                : String(pageSpeedResult.reason),
          };
    const htmlAudit = htmlResult.status === "fulfilled" ? htmlResult.value : null;

    if (!pageSpeed.mobile && !pageSpeed.desktop && !htmlAudit) {
      const pageSpeedError = pageSpeed.error ? `PageSpeed: ${pageSpeed.error}` : "";
      const htmlError =
        htmlResult.status === "rejected"
          ? `HTML fallback: ${
              htmlResult.reason instanceof Error ? htmlResult.reason.message : String(htmlResult.reason)
            }`
          : "";
      return res.status(502).json({
        error: "website_fetch_failed",
        message: [pageSpeedError, htmlError].filter(Boolean).join(" | ") || "Could not audit website.",
      });
    }

    const bestPageSpeed = pageSpeed.mobile || pageSpeed.desktop;
    return res.json({
      ...(htmlAudit || {
        ok: true,
        requestedUrl: url.toString().replace(/\/$/, ""),
        finalUrl: bestPageSpeed?.finalUrl || url.toString().replace(/\/$/, ""),
        status: 200,
        responseTimeMs: bestPageSpeed?.diagnostics?.serverResponseTime?.numericValue ?? 0,
        contentType: "",
        pageSizeBytes: 0,
        checkedAt: new Date().toISOString(),
        robotsTxtStatus: null,
        sitemapXmlStatus: null,
        ...extractPageFacts(""),
      }),
      auditSource: pageSpeed.mobile || pageSpeed.desktop ? "pagespeed" : "html_fallback",
      pageSpeed,
      htmlFallbackError:
        htmlResult.status === "rejected"
          ? htmlResult.reason instanceof Error
            ? htmlResult.reason.message
            : String(htmlResult.reason)
          : null,
    });
  });
}
