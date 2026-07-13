import { Link } from "react-router-dom";
import { ArrowRight, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BusinessProfile } from "@/types/businessProfile";
import { getBusinessProfileCompleteness } from "./businessProfileCompleteness";

type Props = {
  profile?: BusinessProfile | null;
  className?: string;
};

/** Compact nudge when the company profile needs work for better AI/automation. */
export function CompanyProfileNudge({ profile, className }: Props) {
  const completeness = getBusinessProfileCompleteness(profile);
  if (completeness.isStrong) return null;

  const topMissing = completeness.priorities[0];

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3",
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-2 flex-1">
          <div>
            <p className="text-sm font-medium text-foreground">Fyll i Företag — AI blir smartare</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {completeness.percent < 40
                ? "Börja med org.nr (hämtas automatiskt) och en kort beskrivning av vad ni säljer och till vem."
                : topMissing
                  ? `Nästa: ${topMissing.label.toLowerCase()} — ${topMissing.why}`
                  : "Komplettera profilen för bättre leads, utkast och automationer."}
            </p>
          </div>
          <div className="flex items-center gap-2 max-w-xs">
            <Progress value={completeness.percent} className="h-1.5 flex-1" />
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {completeness.percent}%
            </span>
          </div>
        </div>
      </div>
      <Button asChild size="sm" variant="secondary" className="h-10 shrink-0 sm:h-8">
        <Link to="/company">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Fyll i Företag
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Link>
      </Button>
    </div>
  );
}
