import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type PagePurposeStripProps = {
  /** One sentence: what this page is for. */
  title: string;
  /** Short ordered steps for how to use the page effectively. */
  steps?: string[];
  /** Optional hint shown below steps. */
  tip?: string;
  className?: string;
};

/**
 * Explains page intent and a minimal workflow so users know why they're here
 * and what to do first. Collapses on smaller screens to save vertical space.
 */
export function PagePurposeStrip({ title, steps, tip, className }: PagePurposeStripProps) {
  const isDesktop = useIsDesktopWorkspace();
  const hasDetails = Boolean((steps && steps.length > 0) || tip);
  const [expanded, setExpanded] = useState(false);
  const showDetails = isDesktop || expanded;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-gradient-to-r from-muted/20 via-background/40 to-muted/20 px-3 py-2.5 sm:px-4 sm:py-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-foreground/90">{title}</p>
        {!isDesktop && hasDetails ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-expanded={expanded}
          >
            {expanded ? "Dölj" : "Guide"}
            {expanded ? (
              <ChevronUp className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      {showDetails && steps && steps.length > 0 ? (
        <ol className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-1">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold tabular-nums text-primary"
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {showDetails && tip ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/90">{tip}</p>
      ) : null}
    </div>
  );
}
