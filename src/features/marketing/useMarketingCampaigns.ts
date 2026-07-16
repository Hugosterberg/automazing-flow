import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { apiJson } from "@/lib/apiJson";

export interface AdCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  spend7d?: number;
  impressions7d?: number;
  clicks7d?: number;
  reach7d?: number;
  frequency7d?: number;
  conversions7d?: number;
  costPerConversion7d?: number;
  conversionRate7d?: number;
  searchImpressionShare?: number;
  searchBudgetLostShare?: number;
  searchRankLostShare?: number;
  conversionValue7d?: number;
  roas7d?: number;
  metrics?: CampaignMetrics;
  score?: CampaignScore;
}

export type AdChannel =
  | "search"
  | "shopping"
  | "display"
  | "video"
  | "social"
  | "performance_max"
  | "unknown";

export type MarketingGrade = "A" | "B" | "C" | "D" | "F" | "—";
export type MarketingVerdict = "good" | "ok" | "poor" | "unknown";

export interface CampaignMetrics {
  spend: number | null;
  clicks: number | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  conversions: number | null;
  conversionRate: number | null;
  costPerConversion: number | null;
  conversionValue: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  channel: AdChannel;
  searchImpressionShare: number | null;
  searchBudgetLostShare: number | null;
  searchRankLostShare: number | null;
}

export interface CampaignScore {
  score: number;
  grade: MarketingGrade;
  label: string;
  verdict: MarketingVerdict;
  reasons: string[];
  breakdown: {
    roas: number;
    engagement: number;
    conversions: number;
    scale: number;
    audience?: number;
  };
  actions: string[];
}

export type RecommendationSeverity = "critical" | "warning" | "opportunity";

export interface MarketingRecommendation {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  action: string;
  campaignId?: string;
  campaignName?: string;
  platform?: "meta_business" | "google_ads";
}

export interface PlatformScoreSummary {
  score: number;
  grade: MarketingGrade;
  label: string;
  verdict: MarketingVerdict;
  campaignCount: number;
  spend: number;
}

export interface MarketingAnalytics {
  portfolioScore: number | null;
  portfolioGrade: MarketingGrade;
  portfolioLabel: string;
  portfolioVerdict: MarketingVerdict;
  portfolioReasons: string[];
  blendedCtr: number | null;
  blendedCpc: number | null;
  blendedCpm: number | null;
  blendedConversionRate: number | null;
  blendedCostPerConversion: number | null;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  totalConversionValue: number;
  campaignsScored: number;
  campaignsGood: number;
  campaignsOk: number;
  campaignsPoor: number;
  platformScores: Partial<Record<"meta_business" | "google_ads", PlatformScoreSummary>>;
  recommendations: MarketingRecommendation[];
}

export interface AdAccountCampaigns {
  platform: "meta_business" | "google_ads";
  accountName: string;
  currency?: string;
  campaigns: AdCampaign[];
  note?: string;
}

export interface MarketingPerformance {
  windowDays: number;
  adSpendByPlatform: { meta_business?: number; google_ads?: number };
  adSpendCurrency: string | null;
  revenue: number | null;
  orders: number | null;
  revenueCurrency: string | null;
  adSpend: number | null;
  roas: number | null;
  costPerOrder: number | null;
  averageOrderValue: number | null;
  currencyMismatch: boolean;
}

export interface InventoryAdsAlert {
  activeCampaigns: number;
  threshold: number;
  outOfStock: number;
  lowStock: number;
  examples: string[];
}

export interface MarketingCampaignsResponse {
  platforms: AdAccountCampaigns[];
  connected: { meta_business: boolean; google_ads: boolean; shopify: boolean };
  performance?: MarketingPerformance;
  inventoryAlert?: InventoryAdsAlert | null;
  analytics?: MarketingAnalytics | null;
}

export const MARKETING_CAMPAIGNS_KEY = ["marketing-campaigns"] as const;

/**
 * Live ad-campaign data for the Marketing page. Hits /api/marketing/campaigns,
 * which fans out to the connected Meta + Google Ads accounts. Cached for a
 * minute (ad data isn't realtime) and silent so an ad-platform hiccup never
 * pops a toast over the rest of the page.
 */
export function useMarketingCampaigns() {
  const { enabled, user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const query = useQuery<MarketingCampaignsResponse>({
    queryKey: [...MARKETING_CAMPAIGNS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: () =>
      apiJson<MarketingCampaignsResponse>(
        `/api/marketing/campaigns${
          businessProfileId ? `?business_profile_id=${encodeURIComponent(businessProfileId)}` : ""
        }`,
        "Kunde inte ladda kampanjer.",
      ),
    enabled: Boolean(enabled),
    staleTime: 60_000,
    meta: { silent: true },
  });

  return {
    platforms: query.data?.platforms ?? [],
    connected: query.data?.connected ?? { meta_business: false, google_ads: false, shopify: false },
    performance: query.data?.performance,
    inventoryAlert: query.data?.inventoryAlert ?? null,
    analytics: query.data?.analytics ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Reads the blended ROAS from the marketing cache WITHOUT triggering a fetch
 * (`enabled: false`). Lets the home-page daily brief surface an "ads underwater"
 * signal for free when the user has already opened Marketing this session, with
 * zero added cost on a fresh home load (returns null when the cache is cold).
 */
export function useCachedMarketingRoas(): number | null {
  const { user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const query = useQuery<MarketingCampaignsResponse>({
    queryKey: [...MARKETING_CAMPAIGNS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      throw new Error("cache-only");
    },
    enabled: false,
  });
  return query.data?.performance?.roas ?? null;
}
