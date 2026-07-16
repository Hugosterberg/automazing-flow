import { useTranslation } from "react-i18next";
import { Check, Circle, BookmarkCheck, Wand2, FolderOpen, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentFlowStep } from "./contentFlow";

const STEP_IDS: ContentFlowStep[] = ["browse", "selected", "create", "publish"];
const STEP_ICONS = {
  browse: FolderOpen,
  selected: BookmarkCheck,
  create: Wand2,
  publish: Send,
} as const;

export function ContentFlowGuide({
  active,
  selectionCount,
  onGo,
}: {
  active: ContentFlowStep;
  selectionCount: number;
  onGo: (step: ContentFlowStep) => void;
}) {
  const { t } = useTranslation("content");
  const activeIndex = STEP_IDS.findIndex((s) => s === active);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium text-foreground">{t("flowGuide.title")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEP_IDS.map((stepId, index) => {
          const Icon = STEP_ICONS[stepId];
          const done =
            stepId === "browse"
              ? selectionCount > 0
              : stepId === "selected"
                ? selectionCount > 0 && index < activeIndex
                : index < activeIndex;
          const isActive = stepId === active;
          return (
            <button
              key={stepId}
              type="button"
              onClick={() => onGo(stepId)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                isActive ? "border-primary bg-primary/5" : "border-border/80 hover:border-primary/30 hover:bg-accent/30"
              )}
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground">
                    {isActive ? <Icon className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  </span>
                )}
                <span className="text-sm font-medium">{t(`flowGuide.${stepId}.label`)}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t(`flowGuide.${stepId}.hint`)}</p>
              {stepId === "selected" && selectionCount > 0 ? (
                <p className="mt-1 text-[11px] font-medium text-primary">{t("flowGuide.selectedCount", { count: selectionCount })}</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
