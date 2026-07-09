/**
 * Marketing analytics & campaign scoring — turns raw Meta/Google Ads metrics
 * into finished calculations (CTR, CPC, CPM, CPA, CVR, ROAS) and letter grades
 * with channel-aware benchmarks and actionable recommendations.
 */

import type {
  AdAccountCampaigns,
  AdCampaign,
  CampaignMetrics,
  CampaignScore,
  MarketingGrade,
  MarketingVerdict,
} from "../providers/metaAds.ts";
import type { AdPlatform, MarketingPerformance } from "./marketingPerformance.ts";
import {
  channelBenchmark,
  detectAdChannel,
  scoreAgainstBenchmark,
  type AdChannel,
} from "./marketingBenchmarks.ts";

export type { CampaignMetrics, CampaignScore, MarketingGrade, MarketingVerdict };

export type RecommendationSeverity = "critical" | "warning" | "opportunity";

export interface MarketingRecommendation {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  action: string;
  campaignId?: string;
  campaignName?: string;
  platform?: AdPlatform;
}

export interface PlatformScoreSummary {
  score: number;
  grade: MarketingGrade;
  label: string;
  verdict: MarketingVerdict;
  campaignCount: number;
  spend: number;
  channel?: AdChannel;
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
  platformScores: Partial<Record<AdPlatform, PlatformScoreSummary>>;
  recommendations: MarketingRecommendation[];
}

function isFinitePositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function deriveCampaignMetrics(campaign: AdCampaign, platform: AdPlatform): CampaignMetrics {
  const spend = campaign.spend7d ?? null;
  const clicks = campaign.clicks7d ?? null;
  const impressions = campaign.impressions7d ?? null;
  const reach = campaign.reach7d ?? null;
  const frequency = campaign.frequency7d ?? null;
  const conversions = campaign.conversions7d ?? null;
  const conversionValue = campaign.conversionValue7d ?? null;
  const channel = detectAdChannel(campaign.objective, platform);

  const roas =
    campaign.roas7d ??
    (isFinitePositive(spend) && conversionValue != null ? conversionValue / spend : null);

  const ctr =
    isFinitePositive(impressions) && clicks != null && clicks >= 0 ? clicks / impressions : null;
  const cpc = isFinitePositive(clicks) && spend != null ? spend / clicks : null;
  const cpm = isFinitePositive(impressions) && spend != null ? (spend / impressions) * 1000 : null;

  const conversionRate =
    campaign.conversionRate7d ??
    (isFinitePositive(clicks) && conversions != null ? conversions / clicks : null);

  const costPerConversion =
    campaign.costPerConversion7d ??
    (isFinitePositive(conversions) && spend != null ? spend / conversions : null);

  return {
    spend,
    clicks,
    impressions,
    reach,
    frequency,
    conversions,
    conversionRate,
    costPerConversion,
    conversionValue,
    ctr,
    cpc,
    cpm,
    roas,
    channel,
    searchImpressionShare: campaign.searchImpressionShare ?? null,
    searchBudgetLostShare: campaign.searchBudgetLostShare ?? null,
    searchRankLostShare: campaign.searchRankLostShare ?? null,
  };
}

export function scoreRoasComponent(roas: number | null, hasSpend: boolean): number {
  if (!hasSpend) return 50;
  if (roas == null) return 35;
  if (roas >= 4) return 100;
  if (roas >= 3) return 92;
  if (roas >= 2) return 85;
  if (roas >= 1.5) return 78;
  if (roas >= 1) return 70;
  if (roas >= 0.7) return 50;
  if (roas >= 0.5) return 35;
  return 15;
}

export function scoreFrequencyComponent(frequency: number | null, channel: AdChannel): number {
  const bench = channelBenchmark(channel);
  if (frequency == null) return 70;
  return scoreAgainstBenchmark(frequency, bench.frequencyWarn, bench.frequencyBad, false);
}

export function scoreConversionComponent(
  conversionRate: number | null,
  channel: AdChannel,
): number {
  const bench = channelBenchmark(channel);
  return scoreAgainstBenchmark(conversionRate, bench.cvrGood, bench.cvrOk, true);
}

export function scoreEngagementComponent(ctr: number | null, channel: AdChannel): number {
  const bench = channelBenchmark(channel);
  return scoreAgainstBenchmark(ctr, bench.ctrGood, bench.ctrOk, true);
}

export function scoreScaleRiskComponent(spend: number | null, roas: number | null): number {
  if (!isFinitePositive(spend) || spend < 50) return 75;
  if (roas == null) return spend >= 300 ? 40 : 58;
  if (roas >= 1.5) return 95;
  if (roas >= 1) return 88;
  if (roas >= 0.7 && spend < 200) return 62;
  if (roas < 1 && spend >= 500) return 15;
  if (roas < 0.7 && spend >= 200) return 25;
  if (roas < 1) return 42;
  return 70;
}

export function scoreCpaVsAov(
  costPerConversion: number | null,
  averageOrderValue: number | null,
): number {
  if (!isFinitePositive(costPerConversion) || !isFinitePositive(averageOrderValue)) return 60;
  const ratio = costPerConversion / averageOrderValue;
  if (ratio <= 0.25) return 95;
  if (ratio <= 0.4) return 82;
  if (ratio <= 0.6) return 70;
  if (ratio <= 0.85) return 52;
  return 30;
}

export function scoreToGrade(score: number): MarketingGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

export function gradeLabel(grade: MarketingGrade): string {
  switch (grade) {
    case "A":
      return "Utmärkt";
    case "B":
      return "Bra";
    case "C":
      return "Godkänd";
    case "D":
      return "Svag";
    case "F":
      return "Förlustbringande";
    default:
      return "Saknar data";
  }
}

export function verdictFromGrade(grade: MarketingGrade): MarketingVerdict {
  if (grade === "—") return "unknown";
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C") return "ok";
  return "poor";
}

function formatRoasReason(roas: number): string {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(roas)}×`;
}

function formatPctReason(value: number): string {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}

function buildCampaignActions(
  metrics: CampaignMetrics,
  platform: AdPlatform,
  campaign: AdCampaign,
): string[] {
  const actions: string[] = [];
  const bench = channelBenchmark(metrics.channel);

  if (isFinitePositive(metrics.spend) && metrics.roas != null && metrics.roas < 1 && metrics.spend >= 200) {
    actions.push("Pausa eller sänk budget tills ROAS är över 1×");
  }
  if (metrics.frequency != null && metrics.frequency >= bench.frequencyBad) {
    actions.push("Byt creatives eller utöka målgrupp — hög frequency tyder på trött audience");
  } else if (metrics.frequency != null && metrics.frequency >= bench.frequencyWarn) {
    actions.push("Testa nya annonser — frequency börjar bli hög");
  }
  if (metrics.channel === "search" && metrics.searchBudgetLostShare != null && metrics.searchBudgetLostShare > 0.15) {
    actions.push("Öka budget — du tappar sök-exponering p.g.a. budget");
  }
  if (metrics.channel === "search" && metrics.searchRankLostShare != null && metrics.searchRankLostShare > 0.25) {
    actions.push("Höj bud eller förbättra annonsrelevans — tappar p.g.a. ad rank");
  }
  if (isFinitePositive(metrics.spend) && metrics.roas == null && metrics.conversions == null) {
    actions.push(
      platform === "meta_business"
        ? "Kontrollera Meta Pixel och purchase-event"
        : "Kontrollera Google Ads conversion tracking",
    );
  }
  if (metrics.roas != null && metrics.roas >= 2 && isFinitePositive(metrics.spend) && metrics.spend < 300) {
    actions.push("Skala upp — kampanjen har utrymme att växa");
  }
  if (metrics.ctr != null && metrics.ctr < bench.ctrOk * 0.5 && isFinitePositive(metrics.impressions)) {
    actions.push("Testa nya rubriker/bilder — CTR ligger under branschsnitt");
  }
  if (actions.length === 0 && metrics.roas != null && metrics.roas >= 1) {
    actions.push("Fortsätt övervaka — inga akuta åtgärder");
  }
  return actions.slice(0, 3);
}

function buildCampaignReasons(metrics: CampaignMetrics): string[] {
  const bench = channelBenchmark(metrics.channel);
  const reasons: string[] = [];

  if (metrics.roas != null) {
    if (metrics.roas >= 2) reasons.push(`ROAS ${formatRoasReason(metrics.roas)} — stark avkastning`);
    else if (metrics.roas >= 1) reasons.push(`ROAS ${formatRoasReason(metrics.roas)} — täcker annonskostnaden`);
    else reasons.push(`ROAS ${formatRoasReason(metrics.roas)} — spend överstiger attribuerad försäljning`);
  } else if (isFinitePositive(metrics.spend)) {
    reasons.push("Spend utan konverteringsdata — kontrollera tracking");
  }

  if (metrics.ctr != null) {
    reasons.push(
      metrics.ctr >= bench.ctrOk
        ? `CTR ${formatPctReason(metrics.ctr)} — över snitt för ${bench.label}`
        : `CTR ${formatPctReason(metrics.ctr)} — under snitt för ${bench.label}`,
    );
  }

  if (metrics.conversionRate != null) {
    reasons.push(`Konverteringsgrad ${formatPctReason(metrics.conversionRate)} (klick → köp)`);
  }

  if (metrics.frequency != null && metrics.frequency >= bench.frequencyWarn) {
    reasons.push(`Frequency ${metrics.frequency.toFixed(1)} — samma personer ser annonsen ofta`);
  }

  if (metrics.channel === "search" && metrics.searchBudgetLostShare != null && metrics.searchBudgetLostShare > 0.1) {
    reasons.push(`${formatPctReason(metrics.searchBudgetLostShare)} sök-IS tappas p.g.a. budget`);
  }

  return reasons.slice(0, 4);
}

export function computeCampaignScore(
  campaign: AdCampaign,
  platform: AdPlatform,
  averageOrderValue: number | null = null,
): { metrics: CampaignMetrics; score: CampaignScore } {
  const metrics = deriveCampaignMetrics(campaign, platform);
  const hasSpend = isFinitePositive(metrics.spend);

  if (!hasSpend) {
    return {
      metrics,
      score: {
        score: 0,
        grade: "—",
        label: gradeLabel("—"),
        verdict: "unknown",
        reasons: ["Ingen spend senaste 7 dagarna"],
        breakdown: { roas: 0, engagement: 0, conversions: 0, scale: 0 },
        actions: [],
      },
    };
  }

  const roasPart = scoreRoasComponent(metrics.roas, true);
  const engagementPart = scoreEngagementComponent(metrics.ctr, metrics.channel);
  const conversionPart = scoreConversionComponent(metrics.conversionRate, metrics.channel);
  const scalePart = scoreScaleRiskComponent(metrics.spend, metrics.roas);
  const frequencyPart = scoreFrequencyComponent(metrics.frequency, metrics.channel);
  const cpaPart = scoreCpaVsAov(metrics.costPerConversion, averageOrderValue);

  const conversionWeight = metrics.conversionRate != null || metrics.conversions != null ? 0.2 : 0;
  const frequencyWeight = metrics.frequency != null ? 0.1 : 0;
  const cpaWeight = metrics.costPerConversion != null && averageOrderValue != null ? 0.1 : 0;
  const roasWeight = 0.4 - conversionWeight * 0.15;
  const engagementWeight = 0.2;
  const scaleWeight = 0.3 - frequencyWeight - cpaWeight;

  const score = Math.round(
    roasPart * roasWeight +
      engagementPart * engagementWeight +
      conversionPart * conversionWeight +
      scalePart * scaleWeight +
      frequencyPart * frequencyWeight +
      cpaPart * cpaWeight,
  );

  const grade = scoreToGrade(score);
  return {
    metrics,
    score: {
      score,
      grade,
      label: gradeLabel(grade),
      verdict: verdictFromGrade(grade),
      reasons: buildCampaignReasons(metrics),
      breakdown: {
        roas: roasPart,
        engagement: engagementPart,
        conversions: conversionPart,
        scale: scalePart,
        audience: metrics.frequency != null ? frequencyPart : undefined,
      },
      actions: buildCampaignActions(metrics, platform, campaign),
    },
  };
}

function weightedAverage(items: Array<{ weight: number; value: number }>): number | null {
  const valid = items.filter((i) => i.weight > 0 && Number.isFinite(i.value));
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return null;
  return Math.round(valid.reduce((s, i) => s + i.value * i.weight, 0) / totalWeight);
}

export function enrichPlatformsWithScores(
  platforms: AdAccountCampaigns[],
  averageOrderValue: number | null = null,
): AdAccountCampaigns[] {
  return platforms.map((group) => ({
    ...group,
    campaigns: group.campaigns.map((campaign) => {
      const { metrics, score } = computeCampaignScore(campaign, group.platform, averageOrderValue);
      return { ...campaign, metrics, score };
    }),
  }));
}

function buildPortfolioRecommendations(
  platforms: AdAccountCampaigns[],
  performance: MarketingPerformance,
  analytics: Omit<MarketingAnalytics, "recommendations">,
): MarketingRecommendation[] {
  const recs: MarketingRecommendation[] = [];
  let idx = 0;

  if (performance.roas != null && performance.roas < 1 && isFinitePositive(performance.adSpend)) {
    recs.push({
      id: `rec-${idx++}`,
      severity: "critical",
      title: "Total annonsering går back",
      detail: `Shopify-ROAS ${formatRoasReason(performance.roas)} — spend överstiger butiksintäkter senaste ${performance.windowDays} dagarna.`,
      action: "Pausa svaga kampanjer eller omfördela budget till bästa kanaler",
    });
  }

  if (performance.currencyMismatch) {
    recs.push({
      id: `rec-${idx++}`,
      severity: "warning",
      title: "Valuta mismatch i ROAS",
      detail: "Annonsspend och Shopify-intäkter rapporteras i olika valutor — ROAS är ungefärlig.",
      action: "Använd samma valuta i annonskonton och butik för exakta siffror",
    });
  }

  for (const group of platforms) {
    for (const campaign of group.campaigns) {
      if (!campaign.score || campaign.score.grade === "—") continue;
      const topAction = campaign.score.actions[0];
      if (!topAction) continue;

      if (campaign.score.verdict === "poor") {
        recs.push({
          id: `rec-${idx++}`,
          severity: "critical",
          title: `${campaign.name} — betyg ${campaign.score.grade}`,
          detail: campaign.score.reasons[0] ?? campaign.score.label,
          action: topAction,
          campaignId: campaign.id,
          campaignName: campaign.name,
          platform: group.platform,
        });
      } else if (campaign.score.verdict === "good" && topAction.includes("Skala")) {
        recs.push({
          id: `rec-${idx++}`,
          severity: "opportunity",
          title: `Skala ${campaign.name}`,
          detail: campaign.score.reasons[0] ?? "Stark ROAS med utrymme att växa",
          action: topAction,
          campaignId: campaign.id,
          campaignName: campaign.name,
          platform: group.platform,
        });
      }
    }
  }

  if (analytics.campaignsPoor === 0 && performance.roas != null && performance.roas >= 1.5) {
    recs.push({
      id: `rec-${idx}`,
      severity: "opportunity",
      title: "Stark total performance",
      detail: `Portföljen presterar bra med Shopify-ROAS ${formatRoasReason(performance.roas)}.`,
      action: "Testa att öka budget på bästa kampanjerna med 10–20%",
    });
  }

  return recs.slice(0, 8);
}

export function computeMarketingAnalytics(
  platforms: AdAccountCampaigns[],
  performance: MarketingPerformance,
): MarketingAnalytics | null {
  const scoredPlatforms = enrichPlatformsWithScores(platforms, performance.averageOrderValue);
  const allCampaigns = scoredPlatforms.flatMap((g) =>
    g.campaigns.map((c) => ({ campaign: c, platform: g.platform })),
  );

  const withSpend = allCampaigns.filter((c) => isFinitePositive(c.campaign.spend7d));
  if (withSpend.length === 0 && performance.adSpend == null) return null;

  let totalClicks = 0;
  let totalImpressions = 0;
  let totalSpend = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;

  for (const { campaign, platform } of withSpend) {
    const m = campaign.metrics ?? deriveCampaignMetrics(campaign, platform);
    totalSpend += m.spend ?? 0;
    totalClicks += m.clicks ?? 0;
    totalImpressions += m.impressions ?? 0;
    totalConversions += m.conversions ?? 0;
    totalConversionValue += m.conversionValue ?? 0;
  }

  const blendedCtr = totalImpressions > 0 ? totalClicks / totalImpressions : null;
  const blendedCpc = totalClicks > 0 ? totalSpend / totalClicks : null;
  const blendedCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null;
  const blendedConversionRate = totalClicks > 0 && totalConversions > 0 ? totalConversions / totalClicks : null;
  const blendedCostPerConversion =
    totalConversions > 0 ? totalSpend / totalConversions : performance.costPerOrder;

  const campaignScoreItems = withSpend
    .filter((c) => c.campaign.score && c.campaign.score.grade !== "—")
    .map((c) => ({ weight: c.campaign.spend7d ?? 0, value: c.campaign.score!.score }));

  const campaignPortfolioScore = weightedAverage(campaignScoreItems);
  const shopifyRoasScore =
    performance.adSpend != null ? scoreRoasComponent(performance.roas, true) : null;

  let portfolioScore: number | null;
  if (campaignPortfolioScore != null && shopifyRoasScore != null) {
    portfolioScore = Math.round(campaignPortfolioScore * 0.55 + shopifyRoasScore * 0.45);
  } else {
    portfolioScore = campaignPortfolioScore ?? shopifyRoasScore;
  }

  const portfolioGrade = portfolioScore != null ? scoreToGrade(portfolioScore) : "—";
  const portfolioReasons: string[] = [];

  if (performance.roas != null) {
    portfolioReasons.push(
      performance.roas >= 1
        ? `Shopify-ROAS ${formatRoasReason(performance.roas)} — annonsering lönar sig totalt`
        : `Shopify-ROAS ${formatRoasReason(performance.roas)} — total spend överstiger butiksintäkter`,
    );
  }
  if (blendedCtr != null) portfolioReasons.push(`Snitt-CTR ${formatPctReason(blendedCtr)}`);
  if (blendedConversionRate != null) {
    portfolioReasons.push(`Snitt-konverteringsgrad ${formatPctReason(blendedConversionRate)}`);
  }
  if (campaignPortfolioScore != null && campaignPortfolioScore < 60) {
    portfolioReasons.push(
      `${withSpend.filter((c) => c.campaign.score?.verdict === "poor").length} kampanjer behöver åtgärd`,
    );
  }

  const platformScores: Partial<Record<AdPlatform, PlatformScoreSummary>> = {};
  for (const platform of ["meta_business", "google_ads"] as const) {
    const groupCampaigns = withSpend.filter((c) => c.platform === platform);
    if (groupCampaigns.length === 0) continue;
    const platformScore = weightedAverage(
      groupCampaigns
        .filter((c) => c.campaign.score && c.campaign.score.grade !== "—")
        .map((c) => ({ weight: c.campaign.spend7d ?? 0, value: c.campaign.score!.score })),
    );
    if (platformScore == null) continue;
    const grade = scoreToGrade(platformScore);
    const mainChannel = groupCampaigns[0]?.campaign.metrics?.channel;
    platformScores[platform] = {
      score: platformScore,
      grade,
      label: gradeLabel(grade),
      verdict: verdictFromGrade(grade),
      campaignCount: groupCampaigns.length,
      spend: groupCampaigns.reduce((s, c) => s + (c.campaign.spend7d ?? 0), 0),
      channel: mainChannel,
    };
  }

  const scored = withSpend.filter((c) => c.campaign.score && c.campaign.score.grade !== "—");

  const base: Omit<MarketingAnalytics, "recommendations"> = {
    portfolioScore,
    portfolioGrade,
    portfolioLabel: gradeLabel(portfolioGrade),
    portfolioVerdict: verdictFromGrade(portfolioGrade),
    portfolioReasons: portfolioReasons.slice(0, 4),
    blendedCtr,
    blendedCpc,
    blendedCpm,
    blendedConversionRate,
    blendedCostPerConversion,
    totalClicks,
    totalImpressions,
    totalConversions,
    totalConversionValue,
    campaignsScored: scored.length,
    campaignsGood: scored.filter((c) => c.campaign.score?.verdict === "good").length,
    campaignsOk: scored.filter((c) => c.campaign.score?.verdict === "ok").length,
    campaignsPoor: scored.filter((c) => c.campaign.score?.verdict === "poor").length,
    platformScores,
  };

  return {
    ...base,
    recommendations: buildPortfolioRecommendations(scoredPlatforms, performance, base),
  };
}
