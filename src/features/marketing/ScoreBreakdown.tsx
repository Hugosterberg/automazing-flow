import { cn } from "@/lib/utils";

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
  const items = [
    { key: "roas", label: "ROAS", value: breakdown.roas },
    { key: "eng", label: "CTR", value: breakdown.engagement },
    { key: "cvr", label: "CVR", value: breakdown.conversions },
    { key: "scale", label: "Skala", value: breakdown.scale },
    ...(breakdown.audience != null ? [{ key: "aud", label: "Audience", value: breakdown.audience }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map((item) => (
        <div key={item.key} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-8 shrink-0">{item.label}</span>
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
      ))}
    </div>
  );
}
