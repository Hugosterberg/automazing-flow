import { createElement, isValidElement } from "react";
import type { LucideIcon } from "lucide-react";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";
import { pageFadeUp } from "@/lib/motion";

export interface PageHeaderProps {
  /** Required page title. Should be short enough to stay on one line on wide screens. */
  title: string;
  /** Optional supporting copy. Keep to one sentence. */
  description?: React.ReactNode;
  /**
   * Optional leading icon — either a LucideIcon component (rendered as
   * a muted 24px glyph) or a full ReactNode for pages that want a
   * branded / glow icon (AI recommendations, for example).
   */
  icon?: LucideIcon | React.ReactNode;
  /**
   * Right-aligned actions (refresh buttons, generate buttons, filters, …).
   * Rendered in the same flex row as title/description so they stay aligned.
   */
  actions?: React.ReactNode;
  /** Extra classes for the outer m.div. */
  className?: string;
}

/**
 * Standard page heading used at the top of feature pages.
 *
 * Keep the shape consistent across pages so the eye always finds the title
 * and action slot in the same place. Pages should feel like variations of
 * the same chrome — not custom snowflakes.
 *
 * For filters and secondary controls that belong under the header, compose
 * with `<PageToolbar>` immediately after this component.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  // Accept either a component type (most pages pass a LucideIcon — which is
  // a React.forwardRef object, not a function — or a plain function component)
  // or a pre-rendered ReactNode for pages that want a branded/glow icon.
  //
  // NOTE: `typeof icon === "function"` does NOT match forwardRef components.
  // Detecting already-rendered elements first and falling through to
  // `createElement` for component types covers both cases safely.
  let iconNode: React.ReactNode = null;
  if (isValidElement(icon)) {
    iconNode = icon;
  } else if (icon) {
    iconNode = createElement(icon as LucideIcon, {
      className: "h-6 w-6 text-muted-foreground",
      "aria-hidden": true,
    });
  }

  return (
    <m.div
      {...pageFadeUp}
      transition={{ duration: 0.4 }}
      className={cn("flex items-start justify-between gap-3 flex-wrap", className)}
    >
      <div className="flex items-start gap-2 min-w-0">
        {iconNode ? <div className="shrink-0 mt-1">{iconNode}</div> : null}
        <div className="min-w-0">
          <h1 className="select-none cursor-default text-3xl font-bold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex items-center gap-2 flex-wrap ml-auto">{actions}</div>
      ) : null}
    </m.div>
  );
}

export interface PageToolbarProps {
  /** Left-aligned filters, tabs, selects, etc. */
  children: React.ReactNode;
  /**
   * Optional right-side slot for counters / summary text. Mirrors the
   * "N of M" pattern used on Activity and AI recommendations pages.
   */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Secondary toolbar row. Sits under `<PageHeader>` and owns filters,
 * tabs or any narrow controls that apply to the whole page.
 */
export function PageToolbar({ children, trailing, className }: PageToolbarProps) {
  return (
    <m.div
      {...pageFadeUp}
      transition={{ duration: 0.35 }}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {children}
      {trailing ? (
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {trailing}
        </span>
      ) : null}
    </m.div>
  );
}
