import { AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MarketingRecommendation } from "./useMarketingCampaigns";

const SEVERITY_KEYS = {
  critical: "critical",
  warning: "warning",
  opportunity: "opportunity",
} as const;

const SEVERITY_META = {
  critical: {
    icon: AlertTriangle,
    border: "border-destructive/40 bg-destructive/5",
    badge: "text-destructive bg-destructive/10",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-warning/40 bg-warning/5",
    badge: "text-warning bg-warning/10",
  },
  opportunity: {
    icon: TrendingUp,
    border: "border-success/30 bg-success/5",
    badge: "text-success bg-success/10",
  },
} as const;

function RecommendationRow({ rec }: { rec: MarketingRecommendation }) {
  const { t } = useTranslation("marketing");
  const meta = SEVERITY_META[rec.severity];
  const Icon = meta.icon;
  return (
    <div className={cn("rounded-lg border px-3.5 py-3 space-y-1", meta.border)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.badge.split(" ")[0])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{rec.title}</p>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", meta.badge)}>
              {t(`recommendations.severity.${SEVERITY_KEYS[rec.severity]}`)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{rec.detail}</p>
          <p className="text-[11px] text-foreground/90 mt-1.5">
            <Lightbulb className="inline h-3 w-3 mr-1 align-[-2px] text-primary" aria-hidden />
            {rec.action}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MarketingRecommendations({ recommendations }: { recommendations: MarketingRecommendation[] }) {
  const { t } = useTranslation("marketing");
  if (recommendations.length === 0) return null;

  const critical = recommendations.filter((r) => r.severity === "critical");
  const rest = recommendations.filter((r) => r.severity !== "critical");

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          {t("recommendations.title")}
        </CardTitle>
        <CardDescription>{t("recommendations.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {[...critical, ...rest].map((rec) => (
          <RecommendationRow key={rec.id} rec={rec} />
        ))}
      </CardContent>
    </Card>
  );
}
