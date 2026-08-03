import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  /** Platforms with healthy (verified) connections. */
  healthyPlatforms: Iterable<string>;
  /** Platforms present (any health) — unlocks inbox step. */
  connectedPlatforms?: Iterable<string>;
  className?: string;
};

/**
 * Home first-win checklist — guided path to value in ~10 minutes.
 * Persisted dismiss + optional manual step completion via profile document.
 * Connect steps require verified healthy connections.
 */
export function FirstWinChecklist({
  profile,
  healthyPlatforms,
  connectedPlatforms,
  className,
}: Props) {
  const { t } = useTranslation("onboarding");
  const doc = useProfileDocument<FirstWinDoc>(FIRST_WIN_DOC_KEY, {});
  const completeness = getBusinessProfileCompleteness(profile);
  const completed = new Set(doc.data?.completedStepIds ?? []);

  const rawSteps = buildFirstWinSteps({
    kind: profile?.kind,
    healthyPlatforms,
    connectedPlatforms: connectedPlatforms ?? healthyPlatforms,
    profileStrong: completeness.isStrong,
  });

  const steps = rawSteps.map((step) => {
    const localized = localizeStep(step.id, step.done, profile?.kind === "personal", t);
    const done =
      step.id === "enable_automation" || step.id === "open_inbox"
        ? step.done || completed.has(step.id)
        : step.done;
    return { ...step, ...localized, done };
  });

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
        aria-label={t("firstWin.ariaDone")}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("firstWin.allDoneTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("firstWin.allDoneBody")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => persist({ dismissedAt: new Date().toISOString() })}
          >
            {t("firstWin.dismiss")}
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
      aria-label={t("firstWin.aria")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("firstWin.title", { done, total, percent })}
            </p>
            <p className="text-xs text-muted-foreground">{t("firstWin.subtitle")}</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
          aria-label={t("firstWin.dismissAria")}
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
                  {t("firstWin.markDone")}
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

function localizeStep(
  id: FirstWinStepId,
  done: boolean,
  personal: boolean,
  t: (key: string) => string
): { title: string; detail: string; cta: string } {
  switch (id) {
    case "connect_mail":
      return {
        title: done ? t("firstWin.connectMail.titleDone") : t("firstWin.connectMail.title"),
        detail: done ? t("firstWin.connectMail.detailDone") : t("firstWin.connectMail.detail"),
        cta: done ? t("firstWin.connectMail.ctaDone") : t("firstWin.connectMail.cta"),
      };
    case "connect_channel":
      return {
        title: done ? t("firstWin.connectChannel.titleDone") : t("firstWin.connectChannel.title"),
        detail: done
          ? t("firstWin.connectChannel.detailDone")
          : personal
            ? t("firstWin.connectChannel.detailPersonal")
            : t("firstWin.connectChannel.detailBusiness"),
        cta: done ? t("firstWin.connectChannel.ctaDone") : t("firstWin.connectChannel.cta"),
      };
    case "open_inbox":
      return {
        title: t("firstWin.openInbox.title"),
        detail: t("firstWin.openInbox.detail"),
        cta: t("firstWin.openInbox.cta"),
      };
    case "enable_automation":
      return {
        title: t("firstWin.enableAutomation.title"),
        detail: t("firstWin.enableAutomation.detail"),
        cta: t("firstWin.enableAutomation.cta"),
      };
    case "fill_company":
      return {
        title: done ? t("firstWin.fillCompany.titleDone") : t("firstWin.fillCompany.title"),
        detail: done ? t("firstWin.fillCompany.detailDone") : t("firstWin.fillCompany.detail"),
        cta: done ? t("firstWin.fillCompany.ctaDone") : t("firstWin.fillCompany.cta"),
      };
  }
}
