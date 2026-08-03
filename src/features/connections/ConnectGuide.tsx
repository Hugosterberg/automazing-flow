import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, LifeBuoy, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountPlatform } from "@/types/accounts";
import { getConnectGuide } from "./connectGuides";
import {
  clearConnectGuideProgress,
  readConnectGuideProgress,
  writeConnectGuideProgress,
} from "./connectGuideProgress";

interface Props {
  platform: AccountPlatform;
  label: string;
  /** Server-side requirements from the catalog, shown as an admin note. */
  serverNeeds?: string;
  /** Tighter chrome for embedding inside ConnectSession. */
  compact?: boolean;
}

export function ConnectGuide({ platform, label, serverNeeds, compact = false }: Props) {
  const { t } = useTranslation("connections");
  const guide = useMemo(() => getConnectGuide(platform, label), [platform, label]);
  const [done, setDone] = useState<number[]>(() => readConnectGuideProgress(platform));
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  useEffect(() => {
    setDone(readConnectGuideProgress(platform));
  }, [platform]);

  // Pick up auto-complete from ConnectSession after verify succeeds.
  useEffect(() => {
    function onDone(ev: Event) {
      const detail = (ev as CustomEvent<{ platform?: string }>).detail;
      if (detail?.platform === platform) {
        setDone(readConnectGuideProgress(platform));
      }
    }
    window.addEventListener("automazing:connect-session-done", onDone);
    return () => window.removeEventListener("automazing:connect-session-done", onDone);
  }, [platform]);

  const toggleStep = useCallback(
    (index: number) => {
      setDone((prev) => {
        const next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
        writeConnectGuideProgress(platform, next);
        return next;
      });
    },
    [platform]
  );

  const reset = useCallback(() => {
    setDone([]);
    clearConnectGuideProgress(platform);
  }, [platform]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("guide.copied"));
    } catch {
      toast.error(t("guide.copyFailed"), { description: t("guide.copyFailedDesc") });
    }
  }

  if (!guide) return null;

  const total = guide.steps.length;
  const completed = done.filter((i) => i < total).length;
  const allDone = completed === total;

  return (
    <section
      className={cn(
        "rounded-lg border border-border/70 bg-muted/20",
        compact ? "p-2.5" : "p-3"
      )}
      aria-label={t("guide.aria", { label })}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className={cn("font-semibold text-foreground", compact ? "text-[11px]" : "text-xs")}>
            {compact ? t("guide.titleShort") : t("guide.title", { label })}
          </p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
              allDone ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-primary/10 text-primary"
            )}
          >
            {allDone ? t("guide.done") : `${completed}/${total}`}
          </span>
        </div>
        {completed > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={reset}
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            {t("guide.reset")}
          </Button>
        ) : null}
      </header>

      {guide.prerequisites?.length ? (
        <div className="mt-2.5 rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
          <p className="text-[11px] font-medium text-foreground/80">{t("guide.prerequisites")}</p>
          <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {guide.prerequisites.map((item) => (
              <li key={item} className="flex gap-1.5">
                <span aria-hidden className="text-muted-foreground/60">
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="mt-2.5 space-y-1">
        {guide.steps.map((step, index) => {
          const isDone = done.includes(index);
          return (
            <li key={step.title}>
              <div className="flex gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-background/60">
                <button
                  type="button"
                  onClick={() => toggleStep(index)}
                  aria-pressed={isDone}
                  aria-label={
                    isDone
                      ? t("guide.markUndone", { step: index + 1 })
                      : t("guide.markDone", { step: index + 1 })
                  }
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    isDone
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {isDone ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs leading-snug",
                      isDone ? "text-muted-foreground line-through" : "font-medium text-foreground"
                    )}
                  >
                    {step.title}
                  </p>
                  {step.detail ? (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{step.detail}</p>
                  ) : null}
                  {step.copyValue ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate rounded bg-background/80 px-1.5 py-1 text-[10px] text-muted-foreground">
                        {step.copyValue}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
                        onClick={() => void copy(step.copyValue!)}
                      >
                        <Copy className="h-3 w-3" aria-hidden />
                        {t("guide.copy")}
                      </Button>
                    </div>
                  ) : null}
                  {step.link ? (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      {step.link.label}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {guide.result ? (
        <p className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/80">{t("guide.resultLabel")}</span>
          {guide.result}
        </p>
      ) : null}

      {guide.troubleshooting?.length ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowTroubleshooting((v) => !v)}
            aria-expanded={showTroubleshooting}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <LifeBuoy className="h-3 w-3" aria-hidden />
            {t("guide.troubleshooting")}
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", showTroubleshooting && "rotate-180")}
              aria-hidden
            />
          </button>
          {showTroubleshooting ? (
            <dl className="mt-1.5 space-y-2 border-l-2 border-border/60 pl-2.5">
              {guide.troubleshooting.map((item) => (
                <div key={item.problem}>
                  <dt className="text-[11px] font-medium text-foreground/85">{item.problem}</dt>
                  <dd className="text-[11px] leading-relaxed text-muted-foreground">{item.fix}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {guide.docs ? (
          <a
            href={guide.docs.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            {guide.docs.label}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
        {serverNeeds ? (
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            <span className="font-medium">{t("guide.serverNeeds")}</span> {serverNeeds}
          </p>
        ) : null}
      </div>
    </section>
  );
}
