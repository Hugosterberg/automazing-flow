import type { MarketingGrade } from "./useMarketingCampaigns";

/** Map a portfolio grade to a UI tone (kept outside the badge component file
 *  so that file only exports components — Fast Refresh requirement). */
export function portfolioGradeTone(grade: MarketingGrade): "good" | "bad" | "default" {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "D" || grade === "F") return "bad";
  return "default";
}
