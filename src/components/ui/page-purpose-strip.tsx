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
 * and what to do first. Keep copy short — this sits under PageHeader.
 */
export function PagePurposeStrip({ title, steps, tip, className }: PagePurposeStripProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-gradient-to-r from-muted/20 via-background/40 to-muted/20 px-4 py-3",
        className
      )}
    >
      <p className="text-sm font-medium leading-snug text-foreground/90">{title}</p>
      {steps && steps.length > 0 ? (
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
      {tip ? <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/90">{tip}</p> : null}
    </div>
  );
}
