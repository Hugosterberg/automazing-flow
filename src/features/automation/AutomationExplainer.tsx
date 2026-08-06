import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  explainer: string;
  exampleDraft?: string;
  trustNote?: string;
  className?: string;
};

/**
 * Pre-enable education: what the automation does + sample draft before turn-on.
 */
export function AutomationExplainer({ explainer, exampleDraft, trustNote, className }: Props) {
  const { t } = useTranslation("automations");
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("rounded-md border border-border/60 bg-muted/20", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] font-medium text-foreground">{t("explainer.title")}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/50 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{explainer}</p>
          {exampleDraft ? (
            <blockquote className="rounded-md border border-border/50 bg-background/80 px-2.5 py-2 text-[11px] italic text-foreground/90 leading-relaxed">
              {t("explainer.exampleDraft", { draft: exampleDraft })}
            </blockquote>
          ) : null}
          {trustNote ? (
            <p className="inline-flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span>{trustNote}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
