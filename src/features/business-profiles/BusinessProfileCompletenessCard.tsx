import { CheckCircle2, Circle, ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getBusinessProfileCompleteness,
  getFormCompleteness,
  type BusinessProfileFormState,
  type ProfileFieldId,
} from "./businessProfileCompleteness";
import type { BusinessProfile } from "@/types/businessProfile";

type Props = {
  profile?: BusinessProfile | null;
  form?: BusinessProfileFormState;
  onFocusField?: (fieldId: ProfileFieldId) => void;
  className?: string;
};

export function BusinessProfileCompletenessCard({
  profile,
  form,
  onFocusField,
  className,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const completeness = form ? getFormCompleteness(form) : getBusinessProfileCompleteness(profile);

  if (completeness.isStrong) {
    return (
      <div
        className={cn(
          "rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-start gap-3",
          className
        )}
      >
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Profilen räcker för bra AI-förslag</p>
          <p className="text-xs text-muted-foreground mt-1">
            Uppdatera beskrivningen när ni ändrar erbjudande — då hänger Sales och outreach med.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-primary/25 bg-primary/[0.04] p-4 space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            {completeness.percent < 40 ? "Kom igång på 3 minuter" : "Fortsätt fylla i profilen"}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {completeness.percent < 40 ? (
              <>
                <strong className="font-medium text-foreground">1.</strong> Fyll i automatiskt med org.nr ·{" "}
                <strong className="font-medium text-foreground">2.</strong> Skriv kort vad ni säljer ·{" "}
                <strong className="font-medium text-foreground">3.</strong> Spara
              </>
            ) : (
              <>Ju mer som är ifyllt, desto träffsäkrare blir lead-förslag och outreach.</>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tabular-nums text-primary">{completeness.percent}%</p>
          <p className="text-[11px] text-muted-foreground">
            {completeness.filledCount}/{completeness.totalCount} fält
          </p>
        </div>
      </div>

      <Progress value={completeness.percent} className="h-2" />

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {showAll ? "Alla fält" : "Fyll i härnäst"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(showAll ? completeness.missing : completeness.priorities).map((field) => (
            <button
              key={field.id}
              type="button"
              onClick={() => onFocusField?.(field.id)}
              className="flex items-start gap-2 rounded-lg border border-border/80 bg-background hover:border-primary/30 hover:bg-accent/20 px-3 py-2 text-left text-xs transition-colors"
            >
              <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-foreground">{field.label}</span>
                <span className="block text-muted-foreground mt-0.5 line-clamp-2">{field.why}</span>
              </span>
            </button>
          ))}
          {showAll
            ? completeness.filled.map((field) => (
                <div
                  key={field.id}
                  className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="font-medium text-foreground">{field.label}</span>
                </div>
              ))
            : null}
        </div>
        {completeness.missing.length > 3 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setShowAll((v) => !v)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform", showAll && "rotate-180")} />
            {showAll ? "Visa färre" : `Visa alla ${completeness.missing.length} saknade fält`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
