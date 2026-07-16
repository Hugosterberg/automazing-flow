import { apiJson } from "@/lib/apiJson";
import { getApiOrigin } from "@/lib/apiBase";
import { t } from "@/lib/i18n";

export interface TrackingSite {
  siteKey: string | null;
  enabled: boolean;
  createdAt: string | null;
}

export interface VisitSummary {
  windowDays: number;
  totals: { pageviews: number; visitors: number };
  byDay: Array<{ date: string; pageviews: number; visitors: number }>;
  topPages: Array<{ path: string; pageviews: number }>;
  topReferrers: Array<{ host: string; pageviews: number }>;
  devices: Array<{ device: string; pageviews: number }>;
}

export interface CompanyOverview {
  businessProfileId: string;
  name: string;
  visitors7d: number;
  pageviews7d: number;
  /** Trailing 7-day store revenue/orders from the daily marketing snapshot. */
  revenue: number | null;
  orders: number | null;
  currency: string | null;
  followers: number | null;
}

export function fetchTrackingSite(businessProfileId: string): Promise<TrackingSite> {
  return apiJson<TrackingSite>(
    `/api/tracking/site?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    t("insights:service.errors.fetchTrackingSite")
  );
}

export function createTrackingSite(
  businessProfileId: string,
  options: { rotate?: boolean } = {}
): Promise<{ siteKey: string; enabled: boolean; rotated: boolean }> {
  return apiJson(
    `/api/tracking/site?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    t("insights:service.errors.createTrackingSite"),
    { method: "POST", body: { rotate: Boolean(options.rotate) } }
  );
}

export function fetchTrackingSummary(
  businessProfileId: string,
  days = 30
): Promise<VisitSummary> {
  return apiJson<VisitSummary>(
    `/api/tracking/summary?business_profile_id=${encodeURIComponent(businessProfileId)}&days=${days}`,
    t("insights:service.errors.fetchSummary")
  );
}

export function fetchCompaniesOverview(): Promise<{ companies: CompanyOverview[] }> {
  return apiJson<{ companies: CompanyOverview[] }>(
    "/api/insights/companies",
    t("insights:service.errors.fetchCompaniesOverview")
  );
}

/**
 * The copy-paste snippet for the tenant's website. Uses the API origin when
 * the deploy splits frontend/API, else the app's own origin (same-origin
 * Vercel deploys — the common case).
 */
export function buildTrackingSnippet(siteKey: string): string {
  const origin =
    getApiOrigin() || (typeof window !== "undefined" ? window.location.origin : "");
  return `<script async src="${origin}/api/track.js" data-site="${siteKey}"></script>`;
}
