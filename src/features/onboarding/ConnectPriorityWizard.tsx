import { CheckCircle2, PlugZap, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProfileKind } from "@/types/businessProfile";
import type { AccountPlatform } from "@/types/accounts";
import { priorityConnectsForKind } from "./firstWin";

type Props = {
  kind: ProfileKind | null | undefined;
  connectedPlatforms: Iterable<string>;
  className?: string;
  /** When true, show even if some platforms are already connected. */
  force?: boolean;
  /** Opens guided Connect Session instead of only searching. */
  onConnect?: (platform: AccountPlatform) => void;
};

/**
 * Prioritized 3-connect wizard for Connections — answers "what should I connect first?".
 */
export function ConnectPriorityWizard({
  kind,
  connectedPlatforms,
  className,
  force,
  onConnect,
}: Props) {
  const { t } = useTranslation("onboarding");
  const connected = new Set(
    [...connectedPlatforms].map((p) => String(p || "").toLowerCase())
  );
  const priorities = priorityConnectsForKind(kind);
  const remaining = priorities.filter((p) => !connected.has(p.platform));
  if (!force && remaining.length === 0 && connected.size > 0) return null;

  const items = force || remaining.length === 0 ? priorities : remaining;
  const doneCount = priorities.filter((p) => connected.has(p.platform)).length;
  const percent = Math.round((doneCount / Math.max(priorities.length, 1)) * 100);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-background",
        className
      )}
      aria-label={t("wizard.title")}
    >
      <div className="space-y-2 border-b border-border/50 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <PlugZap className="h-3.5 w-3.5" aria-hidden />
              </span>
              <h2 className="text-sm font-semibold text-foreground">{t("wizard.title")}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("wizard.badge")}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {kind === "personal" ? t("wizard.blurbPersonal") : t("wizard.blurbBusiness")}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary">
            {doneCount}/{priorities.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.max(6, percent)}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2 p-3 sm:p-3.5">
        {items.map((item, index) => {
          const done = connected.has(item.platform);
          return (
            <li key={item.platform}>
              <div
                className={cn(
                  "flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                  done
                    ? "border-border/50 bg-background/50"
                    : "border-primary/20 bg-background/90 shadow-sm"
                )}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">
                      {index + 1}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {t(`priority.${item.platform}.title`, { defaultValue: item.title })}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {kind === "personal"
                        ? t(`priority.${item.platform}.whyPersonal`, {
                            defaultValue: t(`priority.${item.platform}.why`, {
                              defaultValue: item.why,
                            }),
                          })
                        : t(`priority.${item.platform}.whyBusiness`, {
                            defaultValue: t(`priority.${item.platform}.why`, {
                              defaultValue: item.why,
                            }),
                          })}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={done ? "ghost" : "default"}
                  className="h-8 shrink-0 text-xs sm:min-w-[5.5rem]"
                  onClick={() => onConnect?.(item.platform)}
                >
                  {done ? t("wizard.open") : t("wizard.connect")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
