import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { readGuideProgress, writeGuideProgress } from "./guideProgress";
import { useGuideContent } from "./useGuideContent";

type Props = {
  guideId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The interactive guide itself: a short checklist you tick off, with the
 * progress kept per browser so a half-finished walkthrough survives a
 * reload. Steps that happen on another screen carry a "take me there"
 * link that navigates and closes the dialog in one tap.
 *
 * On phones this renders as a bottom sheet — `DialogContent` handles that.
 */
export function GuideDialog({ guideId, open, onOpenChange }: Props) {
  const { t } = useTranslation("guides");
  const navigate = useNavigate();
  const guide = useGuideContent(guideId);
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    if (!guideId) return;
    setDone(readGuideProgress(guideId));
  }, [guideId, open]);

  const toggle = useCallback(
    (index: number) => {
      if (!guideId) return;
      setDone((prev) => {
        const next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
        writeGuideProgress(guideId, next);
        return next;
      });
    },
    [guideId]
  );

  const reset = useCallback(() => {
    if (!guideId) return;
    setDone([]);
    writeGuideProgress(guideId, []);
  }, [guideId]);

  const goTo = useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange]
  );

  if (!guide) return null;

  const total = guide.steps.length;
  const completed = done.filter((i) => i < total).length;
  const allDone = completed >= total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-base tracking-tight sm:text-lg">
            {guide.title}
          </DialogTitle>
          {guide.why ? (
            <DialogDescription className="text-sm leading-relaxed">{guide.why}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-spring",
                allDone ? "bg-success" : "bg-primary"
              )}
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {allDone ? t("ui.done") : t("ui.progress", { done: completed, total })}
          </span>
        </div>

        <ol className="space-y-1.5">
          {guide.steps.map((step, index) => {
            const checked = done.includes(index);
            return (
              <li key={step.title}>
                <div
                  className={cn(
                    "rounded-xl border transition-colors",
                    checked ? "border-success/30 bg-success/[0.06]" : "border-border/60 bg-card/40"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    aria-pressed={checked}
                    className="pressable flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors",
                        checked
                          ? "border-success bg-success text-success-foreground"
                          : "border-border bg-muted/40 text-muted-foreground"
                      )}
                      aria-hidden
                    >
                      {checked ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-sm font-medium leading-snug",
                          checked && "text-muted-foreground line-through decoration-muted-foreground/40"
                        )}
                      >
                        {step.title}
                      </span>
                      {step.detail ? (
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {step.detail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {step.to ? (
                    <div className="px-3 pb-2.5 pl-11">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 px-2.5 text-xs"
                        onClick={() => goTo(step.to!)}
                      >
                        {t("ui.goThere")}
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {guide.result ? (
          <p
            className={cn(
              "rounded-xl border px-3 py-2 text-xs leading-relaxed",
              allDone
                ? "border-success/30 bg-success/[0.06] text-foreground"
                : "border-border/60 bg-muted/20 text-muted-foreground"
            )}
          >
            <span className="font-medium text-foreground">{t("ui.result")}: </span>
            {guide.result}
          </p>
        ) : null}

        {completed > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-9 items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            {t("ui.reset")}
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
