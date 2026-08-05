import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /**
   * Optional leading icon. Rendered inside a muted circle. Keep it decorative;
   * callers already provide context via `title` / `description`.
   */
  icon?: LucideIcon;
  /** Short headline. Required — empty state without a headline is noise. */
  title: string;
  /** Supporting copy. Keep to one or two sentences. */
  description?: string;
  /** Primary call-to-action. Can be a Button, Link-as-Button or any node. */
  action?: React.ReactNode;
  /** Secondary action rendered next to `action`. */
  secondaryAction?: React.ReactNode;
  className?: string;
  /**
   * Visual density. `compact` fits inline cards and drawers,
   * `default` is the page-level empty state.
   */
  size?: "default" | "compact";
}

/**
 * Unified empty state. Replaces the ad-hoc "Coming soon" / grey text that
 * previously lived scattered across pages. Always prefer this when a page,
 * section or panel has no data yet — it gives users a clear next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "default",
}: EmptyStateProps) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        // Dashed border says "slot waiting to be filled"; the faint radial
        // pool behind the icon keeps it from reading as dead grey space.
        "rounded-xl border border-dashed border-border/70 bg-[radial-gradient(24rem_12rem_at_50%_0%,hsl(var(--glow)/0.04),transparent_70%)] bg-muted/10",
        compact ? "px-4 py-6 gap-2" : "px-6 py-10 gap-3",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {Icon ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl border border-border/60 bg-card/70 text-muted-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.05)] glow-sm",
            compact ? "h-9 w-9" : "h-12 w-12"
          )}
          aria-hidden
        >
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3
          className={cn(
            "font-semibold text-foreground",
            compact ? "text-sm" : "text-base"
          )}
        >
          {title}
        </h3>
        {description ? (
          <p
            className={cn(
              "text-muted-foreground max-w-md mx-auto",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {(action || secondaryAction) && (
        <div className={cn("flex flex-wrap items-center justify-center gap-2", compact ? "mt-1" : "mt-2")}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
