import { ArrowRight, X, Check } from "lucide-react";
import { LANDING_COMPARISON, LANDING_PILLARS } from "@/lib/landingContent";
import { cn } from "@/lib/utils";

export function LandingComparison() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <article className="rounded-2xl border border-border/70 bg-card/30 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {LANDING_COMPARISON.before.title}
        </p>
        <ul className="mt-4 space-y-3">
          {LANDING_COMPARISON.before.items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive/70" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </article>

      <article className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/50 to-card/20 p-5 glow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
        />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          {LANDING_COMPARISON.after.title}
        </p>
        <ul className="mt-4 space-y-3">
          {LANDING_COMPARISON.after.items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          Så enkelt ska det vara
          <ArrowRight className="h-3.5 w-3.5" />
        </p>
      </article>
    </div>
  );
}

export function LandingPillars() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {LANDING_PILLARS.map((pillar, index) => (
        <article
          key={pillar.title}
          className={cn(
            "group relative overflow-hidden rounded-2xl border border-border/70 bg-card/40 p-5 transition-all hover-lift interactive",
            index === 1 && "lg:-translate-y-1 lg:shadow-lg lg:shadow-primary/5"
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 landing-grid-bg"
          />
          <div className="relative space-y-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
              <pillar.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {pillar.title}
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold">{pillar.tagline}</h3>
            </div>
            <ul className="space-y-2">
              {pillar.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/80" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
