import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Mini horizontal bars showing sub-scores behind the letter grade. */
export function ScoreBreakdown({
  breakdown,
}: {
  breakdown: {
    roas: number;
    engagement: number;
    conversions: number;
    scale: number;
    audience?: number;
  };
}) {
  const { t } = useTranslation("marketing");
  const items = [
    { key: "roas", label: "ROAS", explanation: t("scoreBreakdown.roasExplain"), value: breakdown.roas },
    { key: "eng", label: "CTR", explanation: t("scoreBreakdown.ctrExplain"), value: breakdown.engagement },
    { key: "cvr", label: "CVR", explanation: t("scoreBreakdown.cvrExplain"), value: breakdown.conversions },
    { key: "scale", label: t("scoreBreakdown.scale"), explanation: t("scoreBreakdown.scaleExplain"), value: breakdown.scale },
    ...(breakdown.audience != null
      ? [{ key: "aud", label: "Audience", explanation: t("scoreBreakdown.audienceExplain"), value: breakdown.audience }]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map((item) => (
        <Tooltip key={item.key} delayDuration={150}>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-help">
              <span className="w-8 shrink-0 underline decoration-dotted underline-offset-2">{item.label}</span>
              <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    item.value >= 75 ? "bg-success" : item.value >= 55 ? "bg-warning" : "bg-destructive",
                  )}
                  style={{ width: `${Math.max(4, Math.min(100, item.value))}%` }}
                />
              </div>
              <span className="tabular-nums w-5 text-right">{item.value}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
            {item.explanation}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
