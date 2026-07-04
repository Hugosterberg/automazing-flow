/**
 * Marketing analytics & campaign scoring — turns raw Meta/Google Ads metrics
 * (spend, impressions, clicks, conversion value) into finished calculations
 * (CTR, CPC, CPM, ROAS) and letter grades that answer "is this campaign good
 * or bad?" at a glance.
 *
 * Pure and side-effect free. Shared by the HTTP route and cron snapshots.
 */

import type { AdAccountCampaigns, AdCampaign, CampaignMetrics, CampaignScore, MarketingGrade, MarketingVerdict } from "../providers/metaAds.ts";
import type { AdPlatform, MarketingPerformance } from "./marketingPerformance.ts";

export type { CampaignMetrics, CampaignScore, MarketingGrade, MarketingVerdict };

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
  /** Aggregated across all campaigns with impressions/clicks. */
  blendedCtr: number | null;
  blendedCpc: number | null;
  blendedCpm: number | null;
  totalClicks: number;
  totalImpressions: number;
  totalConversionValue: number;
  campaignsScored: number;
  campaignsGood: number;
  campaignsOk: number;
  campaignsPoor: number;
  platformScores: Partial<Record<AdPlatform, PlatformScoreSummary>>;
}

function isFinitePositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function deriveCampaignMetrics(campaign: AdCampaign): CampaignMetrics {
  const spend = campaign.spend7d ?? null;
  const clicks = campaign.clicks7d ?? null;
  const impressions = campaign.impressions7d ?? null;
  const conversionValue = campaign.conversionValue7d ?? null;
  const roas =
    campaign.roas7d ??
    (isFinitePositive(spend) && conversionValue != null ? conversionValue / spend : null);

  const ctr =
    isFinitePositive(impressions) && clicks != null && clicks >= 0 ? clicks / impressions : null;
  const cpc = isFinitePositive(clicks) && spend != null ? spend / clicks : null;
  const cpm = isFinitePositive(impressions) && spend != null ? (spend / impressions) * 1000 : null;

  return { spend, clicks, impressions, conversionValue, ctr, cpc, cpm, roas };
}

/** Maps ROAS to a 0–100 sub-score. Breakeven (1×) ≈ 70. */
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

/** CTR sub-score — benchmarks differ slightly by platform. */
export function scoreCtrComponent(ctr: number | null, platform: AdPlatform): number {
  if (ctr == null) return 50;
  const pct = ctr * 100;
  if (platform === "google_ads") {
    if (pct >= 4) return 95;
    if (pct >= 2.5) return 85;
    if (pct >= 1.5) return 70;
    if (pct >= 0.8) return 55;
    return 35;
  }
  if (pct >= 2) return 95;
  if (pct >= 1.2) return 85;
  if (pct >= 0.8) return 70;
  if (pct >= 0.4) return 55;
  return 35;
}

/** Penalises high spend paired with weak ROAS (scale risk). */
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

function formatPctReason(ctr: number): string {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(ctr * 100)}%`;
}

function buildCampaignReasons(metrics: CampaignMetrics, platform: AdPlatform): string[] {
  const reasons: string[] = [];
  if (metrics.roas != null) {
    if (metrics.roas >= 2) reasons.push(`ROAS ${formatRoasReason(metrics.roas)} — stark avkastning`);
    else if (metrics.roas >= 1) reasons.push(`ROAS ${formatRoasReason(metrics.roas)} — täcker annonskostnaden`);
    else reasons.push(`ROAS ${formatRoasReason(metrics.roas)} — spend överstiger attribuerad försäljning`);
  } else if (isFinitePositive(metrics.spend)) {
    reasons.push("Spend utan konverteringsdata — kontrollera pixel/conversion tracking");
  }
  if (metrics.ctr != null) {
    const threshold = platform === "google_ads" ? 1.5 : 0.8;
    if (metrics.ctr * 100 >= threshold) reasons.push(`CTR ${formatPctReason(metrics.ctr)} — bra klickfrekvens`);
    else reasons.push(`CTR ${formatPctReason(metrics.ctr)} — låg klickfrekvens`);
  }
  if (isFinitePositive(metrics.spend) && metrics.roas != null && metrics.roas < 1 && metrics.spend >= 200) {
    reasons.push(`Hög spend (${Math.round(metrics.spend)}) med låg ROAS — pausa eller optimera`);
  }
  return reasons.slice(0, 3);
}

export function computeCampaignScore(
  campaign: AdCampaign,
  platform: AdPlatform,
): { metrics: CampaignMetrics; score: CampaignScore } {
  const metrics = deriveCampaignMetrics(campaign);
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
      },
    };
  }

  const roasPart = scoreRoasComponent(metrics.roas, true);
  const ctrPart = scoreCtrComponent(metrics.ctr, platform);
  const scalePart = scoreScaleRiskComponent(metrics.spend, metrics.roas);

  let score: number;
  if (metrics.ctr != null) {
    score = Math.round(roasPart * 0.5 + ctrPart * 0.25 + scalePart * 0.25);
  } else {
    score = Math.round(roasPart * 0.6 + scalePart * 0.4);
  }

  const grade = scoreToGrade(score);
  return {
    metrics,
    score: {
      score,
      grade,
      label: gradeLabel(grade),
      verdict: verdictFromGrade(grade),
      reasons: buildCampaignReasons(metrics, platform),
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
): AdAccountCampaigns[] {
  return platforms.map((group) => ({
    ...group,
    campaigns: group.campaigns.map((campaign) => {
      const { metrics, score } = computeCampaignScore(campaign, group.platform);
      return { ...campaign, metrics, score };
    }),
  }));
}

export function computeMarketingAnalytics(
  platforms: AdAccountCampaigns[],
  performance: MarketingPerformance,
): MarketingAnalytics | null {
  const scoredPlatforms = enrichPlatformsWithScores(platforms);
  const allCampaigns = scoredPlatforms.flatMap((g) =>
    g.campaigns.map((c) => ({ campaign: c, platform: g.platform, group: g })),
  );

  const withSpend = allCampaigns.filter((c) => isFinitePositive(c.campaign.spend7d));
  if (withSpend.length === 0 && performance.adSpend == null) return null;

  let totalClicks = 0;
  let totalImpressions = 0;
  let totalSpend = 0;
  let totalConversionValue = 0;
  for (const { campaign } of withSpend) {
    const m = campaign.metrics ?? deriveCampaignMetrics(campaign);
    totalSpend += m.spend ?? 0;
    totalClicks += m.clicks ?? 0;
    totalImpressions += m.impressions ?? 0;
    totalConversionValue += m.conversionValue ?? 0;
  }

  const blendedCtr = totalImpressions > 0 ? totalClicks / totalImpressions : null;
  const blendedCpc = totalClicks > 0 ? totalSpend / totalClicks : null;
  const blendedCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null;

  const campaignScoreItems = withSpend
    .filter((c) => c.campaign.score && c.campaign.score.grade !== "—")
    .map((c) => ({
      weight: c.campaign.spend7d ?? 0,
      value: c.campaign.score!.score,
    }));

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
    if (performance.roas >= 1) {
      portfolioReasons.push(
        `Shopify-ROAS ${formatRoasReason(performance.roas)} — annonsering lönar sig totalt`,
      );
    } else {
      portfolioReasons.push(
        `Shopify-ROAS ${formatRoasReason(performance.roas)} — total spend överstiger butiksintäkter`,
      );
    }
  }
  if (blendedCtr != null) {
    portfolioReasons.push(`Snitt-CTR ${formatPctReason(blendedCtr)} över aktiva kampanjer`);
  }
  if (campaignPortfolioScore != null && campaignPortfolioScore < 60) {
    portfolioReasons.push(`${withSpend.filter((c) => c.campaign.score?.verdict === "poor").length} kampanjer behöver åtgärd`);
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
    platformScores[platform] = {
      score: platformScore,
      grade,
      label: gradeLabel(grade),
      verdict: verdictFromGrade(grade),
      campaignCount: groupCampaigns.length,
      spend: groupCampaigns.reduce((s, c) => s + (c.campaign.spend7d ?? 0), 0),
    };
  }

  const scored = withSpend.filter((c) => c.campaign.score && c.campaign.score.grade !== "—");

  return {
    portfolioScore,
    portfolioGrade,
    portfolioLabel: gradeLabel(portfolioGrade),
    portfolioVerdict: verdictFromGrade(portfolioGrade),
    portfolioReasons: portfolioReasons.slice(0, 4),
    blendedCtr,
    blendedCpc,
    blendedCpm,
    totalClicks,
    totalImpressions,
    totalConversionValue,
    campaignsScored: scored.length,
    campaignsGood: scored.filter((c) => c.campaign.score?.verdict === "good").length,
    campaignsOk: scored.filter((c) => c.campaign.score?.verdict === "ok").length,
    campaignsPoor: scored.filter((c) => c.campaign.score?.verdict === "poor").length,
    platformScores,
  };
}
