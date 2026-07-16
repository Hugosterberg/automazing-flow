import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileDocument } from "@/features/profile-documents";
import { getBusinessProfileCompleteness } from "@/features/business-profiles";
import type { BusinessProfile } from "@/types/businessProfile";
import {
  FIRST_WIN_DOC_KEY,
  buildFirstWinSteps,
  firstWinProgress,
  type FirstWinDoc,
  type FirstWinStepId,
} from "./firstWin";

type Props = {
  profile?: BusinessProfile | null;
  connectedPlatforms: Iterable<string>;
  className?: string;
};

/**
 * Home first-win checklist — guided path to value in ~10 minutes.
 * Persisted dismiss + optional manual step completion via profile document.
 */
export function FirstWinChecklist({ profile, connectedPlatforms, className }: Props) {
  const doc = useProfileDocument<FirstWinDoc>(FIRST_WIN_DOC_KEY, {});
  const completeness = getBusinessProfileCompleteness(profile);
  const completed = new Set(doc.data?.completedStepIds ?? []);

  const steps = buildFirstWinSteps({
    kind: profile?.kind,
    connectedPlatforms,
    profileStrong: completeness.isStrong,
  }).map((step) =>
    step.id === "enable_automation" || step.id === "open_inbox"
      ? { ...step, done: step.done || completed.has(step.id) }
      : step
  );

  const { done, total, percent, allDone } = firstWinProgress(steps);
  const dismissed = Boolean(doc.data?.dismissedAt);

  if (doc.isLoading) return null;
  if (dismissed) return null;

  function persist(partial: FirstWinDoc) {
    doc.save({
      ...doc.data,
      completedStepIds: [...completed],
      ...partial,
    });
  }

  if (allDone) {
    return (
      <section
        className={cn(
          "rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 sm:px-4",
          className
        )}
        aria-label="Kom igång — klart"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Du är igång</p>
            <p className="text-xs text-muted-foreground">
              Brief, Meddelanden och Automationer har data att jobba med. Fortsätt under Hem varje morgon.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => persist({ dismissedAt: new Date().toISOString() })}
          >
            Dölj
          </Button>
        </div>
      </section>
    );
  }

  function markStep(id: FirstWinStepId) {
    const next = new Set(completed);
    next.add(id);
    persist({ completedStepIds: [...next] });
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 sm:px-4",
        className
      )}
      aria-label="Kom igång på 10 minuter"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Kom igång — {done}/{total} klart ({percent}%)
            </p>
            <p className="text-xs text-muted-foreground">
              Koppla, öppna inkorgen och aktivera en trygg automation. Du godkänner alltid innan sändning.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
          aria-label="Dölj checklista"
          onClick={() => persist({ dismissedAt: new Date().toISOString() })}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1.5">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-2">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0">
                <p className={cn("text-xs font-medium", step.done && "text-muted-foreground")}>
                  {step.title}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">{step.detail}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1 sm:pl-6">
              {!step.done && (step.id === "enable_automation" || step.id === "open_inbox") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => markStep(step.id)}
                >
                  Markera klar
                </Button>
              ) : null}
              <Button
                asChild
                type="button"
                size="sm"
                variant={step.done ? "ghost" : "outline"}
                className="h-7 text-xs"
              >
                <Link to={step.to}>
                  {step.cta}
                  <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
