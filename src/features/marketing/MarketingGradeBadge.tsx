import { cn } from "@/lib/utils";
import type { MarketingGrade, MarketingVerdict } from "./useMarketingCampaigns";

const GRADE_STYLES: Record<MarketingGrade, string> = {
  A: "border-success/50 bg-success/15 text-success",
  B: "border-success/30 bg-success/10 text-success",
  C: "border-warning/40 bg-warning/10 text-warning",
  D: "border-destructive/30 bg-destructive/10 text-destructive",
  F: "border-destructive/50 bg-destructive/15 text-destructive",
  "—": "border-border bg-muted/40 text-muted-foreground",
};

const VERDICT_DOT: Record<MarketingVerdict, string> = {
  good: "bg-success",
  ok: "bg-warning",
  poor: "bg-destructive",
  unknown: "bg-muted-foreground/50",
};

export function MarketingGradeBadge({
  grade,
  label,
  score,
  size = "sm",
  showScore = false,
}: {
  grade: MarketingGrade;
  label?: string;
  score?: number | null;
  size?: "sm" | "lg";
  showScore?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums",
        GRADE_STYLES[grade],
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]",
      )}
      title={label}
    >
      {grade}
      {showScore && score != null ? (
        <span className="font-normal opacity-80">· {score}</span>
      ) : null}
    </span>
  );
}

export function MarketingVerdictDot({ verdict }: { verdict: MarketingVerdict }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", VERDICT_DOT[verdict])} aria-hidden />;
}

export function portfolioGradeTone(grade: MarketingGrade): "good" | "bad" | "default" {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "D" || grade === "F") return "bad";
  return "default";
}
