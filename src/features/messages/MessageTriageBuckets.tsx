import { cn } from "@/lib/utils";
import {
  TRIAGE_BUCKET_HINTS,
  TRIAGE_BUCKET_LABELS,
  TRIAGE_BUCKET_ORDER,
  type TriageBucket,
} from "./messageTriage";

type Props = {
  value: TriageBucket | "all";
  counts: Record<TriageBucket, number>;
  onChange: (next: TriageBucket | "all") => void;
  className?: string;
};

/**
 * Compact action-bucket filter for the inbox — Idag / Denna vecka / FYI / Brus.
 */
export function MessageTriageBuckets({ value, counts, onChange, className }: Props) {
  const total = TRIAGE_BUCKET_ORDER.reduce((sum, b) => sum + counts[b], 0);
  const actionCount = counts.today + counts.week;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5 sm:px-3",
        className
      )}
      role="group"
      aria-label="Triage-hinkar"
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
          value === "all"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
        title="Visa alla i nuvarande filter"
      >
        Alla
        {total > 0 ? (
          <span className="tabular-nums text-[10px] opacity-80">{total > 99 ? "99+" : total}</span>
        ) : null}
      </button>
      {TRIAGE_BUCKET_ORDER.map((bucket) => {
        const count = counts[bucket];
        const active = value === bucket;
        const emphasize = bucket === "today" && count > 0;
        return (
          <button
            key={bucket}
            type="button"
            onClick={() => onChange(bucket)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
              active
                ? bucket === "today"
                  ? "bg-destructive/15 text-destructive"
                  : bucket === "week"
                    ? "bg-warning/15 text-warning"
                    : "bg-muted text-foreground"
                : emphasize
                  ? "text-destructive/90 hover:bg-destructive/10"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            title={TRIAGE_BUCKET_HINTS[bucket]}
          >
            {TRIAGE_BUCKET_LABELS[bucket]}
            {count > 0 ? (
              <span className="tabular-nums text-[10px] opacity-80">{count > 99 ? "99+" : count}</span>
            ) : null}
          </button>
        );
      })}
      {actionCount > 0 && value === "all" ? (
        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
          {actionCount} att svara
        </span>
      ) : null}
    </div>
  );
}
