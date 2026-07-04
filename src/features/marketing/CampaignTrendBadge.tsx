import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampaignTrend } from "./campaignTrend";

export function CampaignTrendBadge({ trend }: { trend: CampaignTrend | undefined }) {
  if (!trend?.previous) return null;

  const Icon =
    trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  const tone =
    trend.direction === "up"
      ? "text-success bg-success/10 border-success/30"
      : trend.direction === "down"
        ? "text-destructive bg-destructive/10 border-destructive/30"
        : "text-muted-foreground bg-muted/40 border-border";

  const scoreText =
    trend.scoreDelta != null
      ? `${trend.scoreDelta > 0 ? "+" : ""}${Math.round(trend.scoreDelta)} p`
      : trend.roasDelta != null
        ? `${trend.roasDelta > 0 ? "+" : ""}${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(trend.roasDelta)}× ROAS`
        : null;

  if (!scoreText) return null;

  const gradeHint =
    trend.previousGrade && trend.current?.grade && trend.previousGrade !== trend.current.grade
      ? `${trend.previousGrade}→${trend.current.grade}`
      : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums shrink-0",
        tone,
      )}
      title={`Vs ~7 dagar sedan${gradeHint ? ` · betyg ${gradeHint}` : ""}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {scoreText}
      {gradeHint ? <span className="opacity-80">· {gradeHint}</span> : null}
    </span>
  );
}
