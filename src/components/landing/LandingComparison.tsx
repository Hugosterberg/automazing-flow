import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { ArrowRight, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANDING_PILLAR_DEFS } from "@/lib/landingContent";
import { cn } from "@/lib/utils";

type ComparisonSide = "before" | "after";

function ComparisonCard({ side }: { side: ComparisonSide }) {
  const { t } = useTranslation("landing");
  const isAfter = side === "after";
  const title = t(isAfter ? "comparison.afterTitle" : "comparison.beforeTitle");
  const items = isAfter
    ? [t("comparison.after0"), t("comparison.after1"), t("comparison.after2"), t("comparison.after3")]
    : [
        t("comparison.before0"),
        t("comparison.before1"),
        t("comparison.before2"),
        t("comparison.before3"),
      ];

  return (
    <article
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border p-5 sm:p-6",
        isAfter
          ? "border-primary/25 bg-gradient-to-br from-primary/10 via-card/50 to-card/20 landing-premium-card glow-sm"
          : "border-border/70 bg-card/30"
      )}
    >
      {isAfter ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
        />
      ) : null}
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wide",
          isAfter ? "text-primary" : "text-muted-foreground"
        )}
      >
        {title}
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "flex items-start gap-2.5 text-sm",
              isAfter ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {isAfter ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive/70" aria-hidden />
            )}
            {item}
          </li>
        ))}
      </ul>
      {isAfter ? (
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          {t("comparison.soSimple")}
          <ArrowRight className="h-3.5 w-3.5" />
        </p>
      ) : null}
    </article>
  );
}

export function LandingComparison() {
  const { t } = useTranslation("landing");
  const [activeSide, setActiveSide] = useState<ComparisonSide>("after");

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex rounded-xl border border-border/60 bg-muted/20 p-1 sm:hidden">
        {(["before", "after"] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setActiveSide(side)}
            className={cn(
              "relative flex-1 overflow-hidden rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-300",
              activeSide === side
                ? side === "after"
                  ? "bg-primary text-primary-foreground shadow-md glow-sm"
                  : "bg-card text-foreground shadow-md"
                : "text-muted-foreground"
            )}
          >
            {side === "before" ? t("comparisonUi.withoutShort") : t("comparisonUi.withShort")}
          </button>
        ))}
      </div>

      <div className="sm:hidden">
        <AnimatePresence mode="wait">
          <m.div
            key={activeSide}
            initial={{ opacity: 0, x: activeSide === "after" ? 12 : -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: activeSide === "after" ? -12 : 12 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <ComparisonCard side={activeSide} />
          </m.div>
        </AnimatePresence>
      </div>

      <div className="hidden min-w-0 gap-3 sm:grid sm:grid-cols-2">
        <ComparisonCard side="before" />
        <ComparisonCard side="after" />
      </div>
    </div>
  );
}

export function LandingPillars() {
  const { t } = useTranslation("landing");

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {LANDING_PILLAR_DEFS.map((pillar, index) => {
        const title = t(`pillars.${pillar.key}.title`);
        const tagline = t(`pillars.${pillar.key}.tagline`);
        const items = [
          t(`pillars.${pillar.key}.i0`),
          t(`pillars.${pillar.key}.i1`),
          t(`pillars.${pillar.key}.i2`),
        ];
        return (
          <article
            key={pillar.key}
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-border/70 bg-card/40 p-5 transition-all duration-300 hover-lift interactive landing-premium-card",
              index === 1 && "lg:-translate-y-1 lg:shadow-lg lg:shadow-primary/10"
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 landing-grid-bg"
            />
            <div className="relative space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-gradient-to-br from-info/15 via-muted/40 to-card/40 shadow-[0_0_24px_-10px_hsl(var(--info)/0.5)] transition-shadow duration-300 group-hover:shadow-[0_0_28px_-8px_hsl(var(--info)/0.65)]">
                <pillar.icon className="h-5 w-5 text-info transition-transform duration-300 group-hover:scale-110" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {title}
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold">{tagline}</h3>
              </div>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/80" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}
