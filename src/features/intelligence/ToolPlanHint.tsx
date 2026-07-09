import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AiToolPlan } from "./toolPlanTypes";

/** Compact explanation of which MCP providers were selected for a run. */
export function ToolPlanHint({
  plan,
  selectedPlatform,
  className,
}: {
  plan?: AiToolPlan | null;
  selectedPlatform?: string | null;
  className?: string;
}) {
  if (!plan && !selectedPlatform) return null;

  const selected =
    plan?.platforms.filter((p) => p.selected) ??
    (selectedPlatform ? [{ platform: selectedPlatform, label: selectedPlatform }] : []);

  return (
    <div
      className={cn(
        "rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2 space-y-1.5",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1.5 flex-1">
          <p className="text-[11px] font-medium text-foreground">Smart verktygsval</p>
          {plan?.explanation ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed">{plan.explanation}</p>
          ) : null}
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.map((p) => (
                <Badge
                  key={p.platform}
                  variant="secondary"
                  className="text-[10px] h-5 font-normal"
                >
                  {p.label ?? p.platform}
                </Badge>
              ))}
              {plan && plan.platforms.some((p) => !p.selected && p.ready) ? (
                <span className="text-[10px] text-muted-foreground self-center">
                  · {plan.platforms.filter((p) => !p.selected && p.ready).length} andra redo
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
