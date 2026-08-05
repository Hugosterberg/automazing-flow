import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  HelpCircle,
  Home,
  PlugZap,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProfileDocument } from "@/features/profile-documents/useProfileDocument";
import { openGuide } from "@/features/guides/guideEvents";
import type { ProfileKind } from "@/types/businessProfile";
import { priorityConnectsForKind } from "./firstWin";
import {
  OPEN_WELCOME_TOUR_EVENT,
  WELCOME_TOUR_DOC_KEY,
  welcomeTourSeen,
  type WelcomeTourDoc,
} from "./welcomeTourState";

type Props = {
  kind: ProfileKind | null | undefined;
  /** Number of connected accounts — the tour auto-opens only at zero. */
  connectedCount: number;
};

const SLIDE_COUNT = 4;

/**
 * First-login welcome tour: four short slides that answer, in order,
 * "what is this?", "what do I do first?", "is it safe?" and "how do I
 * work here day to day?". Every slide ends in a real action — the connect
 * slide launches the guided connections wizard, the last slide opens the
 * interactive Home guide — so the tour hands the user into the flows that
 * already exist instead of describing them.
 *
 * Auto-opens once per tenant (profile document, so it follows the user
 * across devices) when there are no connections yet. Reopenable from the
 * command palette via `openWelcomeTour()`.
 */
export function WelcomeTour({ kind, connectedCount }: Props) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const doc = useProfileDocument<WelcomeTourDoc>(WELCOME_TOUR_DOC_KEY, {});
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const seen = welcomeTourSeen(doc.data);

  // Auto-open exactly once: fresh tenant, nothing connected, doc loaded.
  useEffect(() => {
    if (doc.isLoading || seen || connectedCount > 0) return;
    setOpen(true);
  }, [doc.isLoading, seen, connectedCount]);

  useEffect(() => {
    function onOpen() {
      setSlide(0);
      setOpen(true);
    }
    window.addEventListener(OPEN_WELCOME_TOUR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WELCOME_TOUR_EVENT, onOpen);
  }, []);

  const persist = useCallback(
    (patch: WelcomeTourDoc) => {
      doc.save({ ...(doc.data ?? {}), ...patch });
    },
    [doc]
  );

  const dismiss = useCallback(() => {
    setOpen(false);
    if (!seen) persist({ dismissedAt: new Date().toISOString() });
  }, [persist, seen]);

  const complete = useCallback(() => {
    setOpen(false);
    if (!seen) persist({ completedAt: new Date().toISOString() });
  }, [persist, seen]);

  const goConnect = useCallback(() => {
    complete();
    navigate("/connections?wizard=1");
  }, [complete, navigate]);

  const finishWithGuide = useCallback(() => {
    complete();
    openGuide("home");
  }, [complete]);

  const priorities = useMemo(() => priorityConnectsForKind(kind), [kind]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) dismiss();
      else setOpen(true);
    },
    [dismiss]
  );

  const isLast = slide === SLIDE_COUNT - 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogTitle className="sr-only">{t("tour.title")}</DialogTitle>

        {/* Slide body */}
        <div className="min-h-[16rem] sm:min-h-[15rem]">
          {slide === 0 ? (
            <div className="space-y-4 pt-1 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-card/70 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)] glow-md">
                <Sparkles className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <div className="space-y-2">
                <h2 className="font-display gradient-text text-xl font-bold tracking-tight">
                  {t("tour.welcome.title")}
                </h2>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("tour.welcome.body")}
                </p>
              </div>
              <ul className="mx-auto flex max-w-sm flex-wrap items-center justify-center gap-1.5">
                {[t("tour.welcome.chip1"), t("tour.welcome.chip2"), t("tour.welcome.chip3")].map(
                  (chip) => (
                    <li
                      key={chip}
                      className="rounded-full border border-border/60 bg-card/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {chip}
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}

          {slide === 1 ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <PlugZap className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {t("tour.connect.title")}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("tour.connect.body")}
              </p>
              <ul className="space-y-1.5">
                {priorities.map((item, index) => (
                  <li
                    key={item.platform}
                    className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold tabular-nums text-primary"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {t(`priority.${item.platform}.title`, { defaultValue: item.title })}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {t(
                          `priority.${item.platform}.${kind === "personal" ? "whyPersonal" : "whyBusiness"}`,
                          { defaultValue: t(`priority.${item.platform}.why`, { defaultValue: item.why }) }
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground/80">
                {t("tour.connect.note")}
              </p>
            </div>
          ) : null}

          {slide === 2 ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
                  <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {t("tour.safety.title")}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("tour.safety.body")}
              </p>
              <ul className="space-y-1.5">
                {[t("tour.safety.point1"), t("tour.safety.point2"), t("tour.safety.point3")].map(
                  (point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-foreground/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}

          {slide === 3 ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Home className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {t("tour.daily.title")}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{t("tour.daily.body")}</p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {t("tour.daily.point1")}
                  </span>
                </li>
                <li className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {t("tour.daily.point2")}
                  </span>
                </li>
                <li className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                  <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {t("tour.daily.point3")}
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5" aria-hidden>
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => setSlide(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === slide ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          {slide === 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
              {t("tour.skip")}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSlide((s) => Math.max(0, s - 1))}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
              {t("tour.back")}
            </Button>
          )}

          <div className="flex items-center gap-2">
            {slide === 1 ? (
              <Button type="button" size="sm" onClick={goConnect}>
                <PlugZap className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {t("tour.connect.cta")}
              </Button>
            ) : null}
            {isLast ? (
              <Button type="button" size="sm" onClick={finishWithGuide}>
                {t("tour.finish")}
                <Sparkles className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={slide === 1 ? "secondary" : "default"}
                onClick={() => setSlide((s) => Math.min(SLIDE_COUNT - 1, s + 1))}
              >
                {t("tour.next")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
