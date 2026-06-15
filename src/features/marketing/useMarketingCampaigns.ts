import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

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
  conversionValue7d?: number;
  roas7d?: number;
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
  const query = useQuery<MarketingCampaignsResponse>({
    queryKey: [...MARKETING_CAMPAIGNS_KEY, user?.id ?? null],
    queryFn: async () => {
      const res = await fetchWithTimeout(apiUrl("/api/marketing/campaigns"), {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't load campaigns."));
      return body as MarketingCampaignsResponse;
    },
    enabled: Boolean(enabled),
    staleTime: 60_000,
    meta: { silent: true },
  });

  return {
    platforms: query.data?.platforms ?? [],
    connected: query.data?.connected ?? { meta_business: false, google_ads: false, shopify: false },
    performance: query.data?.performance,
    inventoryAlert: query.data?.inventoryAlert ?? null,
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
  const query = useQuery<MarketingCampaignsResponse>({
    queryKey: [...MARKETING_CAMPAIGNS_KEY, user?.id ?? null],
    queryFn: async () => {
      throw new Error("cache-only");
    },
    enabled: false,
  });
  return query.data?.performance?.roas ?? null;
}
