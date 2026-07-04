export { MarketingSetupCard } from "./MarketingSetupCard";
export { MarketingCampaigns } from "./MarketingCampaigns";
export { CampaignFollowUp, type FollowUpCampaign } from "./CampaignFollowUp";
export { MarketingPerformance } from "./MarketingPerformance";
export { InventoryAdsAlert } from "./InventoryAdsAlert";
export { MarketingPathsHub } from "./MarketingPathsHub";
export { MARKETING_PATHS, MARKETING_PATH_GROUPS, type MarketingPath } from "./marketingPaths";
export { useMarketingTrend, MARKETING_TREND_KEY } from "./useMarketingTrend";
export { computeMarketingTrend, type MarketingSnapshot, type MarketingTrend } from "./marketingTrend";
export {
  useMarketingCampaigns,
  useCachedMarketingRoas,
  MARKETING_CAMPAIGNS_KEY,
  type AdCampaign,
  type AdAccountCampaigns,
  type MarketingCampaignsResponse,
  type MarketingPerformance as MarketingPerformanceData,
} from "./useMarketingCampaigns";
