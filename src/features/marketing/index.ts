export { MarketingGradeBadge, MarketingVerdictDot } from "./MarketingGradeBadge";
export { portfolioGradeTone } from "./gradeTone";
export { MarketingSetupCard } from "./MarketingSetupCard";
export { MarketingRecommendations } from "./MarketingRecommendations";
export { ScoreBreakdown } from "./ScoreBreakdown";
export { MarketingCampaigns } from "./MarketingCampaigns";
export { CampaignFollowUp, type FollowUpCampaign } from "./CampaignFollowUp";
export { MarketingPerformance } from "./MarketingPerformance";
export { MetaAdCommentsPanel } from "./MetaAdCommentsPanel";
export { useMetaAdComments, useCachedMetaAdCommentCount, META_AD_COMMENTS_KEY } from "./useMetaAdComments";
export { MarketingTrendChart } from "./MarketingTrendChart";
export { InventoryAdsAlert } from "./InventoryAdsAlert";
export { MarketingPathsHub } from "./MarketingPathsHub";
export { MARKETING_PATHS, MARKETING_PATH_GROUPS, type MarketingPath } from "./marketingPaths";
export { useMarketingTrend, MARKETING_TREND_KEY } from "./useMarketingTrend";
export { useMarketingCampaignTrends, MARKETING_CAMPAIGN_TREND_KEY, campaignTrendKey } from "./useMarketingCampaignTrends";
export { computeMarketingTrend, type MarketingSnapshot, type MarketingTrend } from "./marketingTrend";
export { computeCampaignTrends, type CampaignSnapshot, type CampaignTrend } from "./campaignTrend";
export { CampaignTrendBadge } from "./CampaignTrendBadge";
export {
  useMarketingCampaigns,
  useCachedMarketingRoas,
  MARKETING_CAMPAIGNS_KEY,
  type AdCampaign,
  type AdAccountCampaigns,
  type MarketingCampaignsResponse,
  type MarketingPerformance as MarketingPerformanceData,
  type MarketingAnalytics,
  type MarketingGrade,
  type CampaignScore,
  type MarketingRecommendation,
} from "./useMarketingCampaigns";
