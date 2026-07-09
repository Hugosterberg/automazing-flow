import { CheckCircle2, Circle, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getBusinessProfileCompleteness,
  getFormCompleteness,
  PROFILE_FIELD_GUIDE,
  type BusinessProfileFormState,
} from "./businessProfileCompleteness";
import type { BusinessProfile } from "@/types/businessProfile";

type Props = {
  profile?: BusinessProfile | null;
  form?: BusinessProfileFormState;
  onFocusField?: (fieldId: string) => void;
  className?: string;
};

export function BusinessProfileCompletenessCard({
  profile,
  form,
  onFocusField,
  className,
}: Props) {
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
          <p className="text-sm font-medium text-foreground">Bolagsprofilen är komplett nog för bra AI-förslag</p>
          <p className="text-xs text-muted-foreground mt-1">
            Uppdatera beskrivningen när ni lanserar nya tjänster så hänger Sales, outreach och innehåll med.
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
            Fyll i bolagsprofilen — AI blir mycket bättre
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            Ju mer vi vet om ert bolag, desto träffsäkrare blir lead-förslag, outreach-utkast och innehåll. Börja med{" "}
            <strong className="font-medium text-foreground">beskrivningen</strong> — den väger tyngst.
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

      <div className="grid gap-2 sm:grid-cols-2">
        {PROFILE_FIELD_GUIDE.map((field) => {
          const done = completeness.filled.some((f) => f.id === field.id);
          return (
            <button
              key={field.id}
              type="button"
              onClick={() => onFocusField?.(field.id)}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                done
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-border/80 bg-background hover:border-primary/30 hover:bg-accent/20"
              )}
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <span>
                <span className={cn("font-medium", done ? "text-foreground" : "text-foreground/90")}>
                  {field.label}
                </span>
                {!done ? (
                  <span className="block text-muted-foreground mt-0.5 line-clamp-2">{field.why}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
