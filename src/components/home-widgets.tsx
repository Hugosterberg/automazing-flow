import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Presentational building blocks for the home page (src/pages/Index.tsx).
 * No data fetching here — the page passes everything in, so these stay
 * trivially testable and the page file stays focused on composition.
 */

/**
 * Today tile — one compact stat with a deep-link. Rendered in the home
 * dashboard grid. Uses tone to map metric to severity so the page reads
 * at a glance without requiring legends.
 */
export function TodayTile({
  title,
  value,
  hint,
  icon: Icon,
  to,
  tone = "default",
  onPrefetch,
}: {
  title: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  tone?: "default" | "warning" | "info" | "success";
  onPrefetch?: (to: string) => void;
}) {
  const toneAccent =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : tone === "success"
          ? "text-success"
          : "text-primary";
  const toneSurface =
    tone === "warning"
      ? "mobile-widget-tile-warning"
      : tone === "info"
        ? "mobile-widget-tile-info"
        : tone === "success"
          ? "mobile-widget-tile-success"
          : "";
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className={cn(
        "group pressable mobile-widget-tile block px-3.5 py-3.5 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:px-4 sm:py-4 sm:shadow-none",
        "sm:hover:border-primary/40 sm:hover:bg-accent/40",
        toneSurface
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-background/40 sm:h-auto sm:w-auto sm:rounded-none sm:bg-transparent",
            toneAccent
          )}
        >
          <Icon className={cn("h-4 w-4", toneAccent)} />
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-muted-foreground sm:mt-0.5 sm:text-xs">{title}</p>
      {hint ? (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80 sm:mt-1 sm:text-[11px]">{hint}</p>
      ) : null}
    </Link>
  );
}

/**
 * Compact card for the "Jump to" row at the bottom of the home page.
 * Mirrors the visual language of the AI widget: tinted icon box, left-
 * aligned title + description, hover arrow cue. Kept intentionally quiet
 * so the Today dashboard and AI widget remain the primary focus.
 */
export function JumpCard({
  to,
  icon: Icon,
  title,
  description,
  onPrefetch,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onPrefetch?: (to: string) => void;
}) {
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className={cn(
        "group pressable flex items-start gap-3 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-3.5 sm:rounded-xl sm:border-border sm:bg-card sm:px-4",
        "hover:border-primary/40 hover:bg-accent/40"
      )}
    >
      <div className="rounded-xl bg-muted/60 p-2.5 shrink-0 transition-colors group-hover:bg-primary/10 sm:rounded-md sm:p-2">
        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-60 transition-all sm:opacity-0 sm:group-hover:translate-x-0.5 sm:group-hover:opacity-100" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {description}
        </p>
      </div>
    </Link>
  );
}

/**
 * One stat card in the "Snabböversikt" strip. The three cards (reviews,
 * calendars, mail) share this exact frame; keeping it in one place also
 * gives them the same hover/press language and route prefetch as the
 * Today tiles above.
 */
export function QuickOverviewCard({
  to,
  icon: Icon,
  iconClass,
  value,
  label,
  hint,
  onPrefetch,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  value: React.ReactNode;
  label: string;
  hint: string;
  onPrefetch?: (to: string) => void;
}) {
  return (
    <Link
      to={to}
      onPointerEnter={() => onPrefetch?.(to)}
      onFocus={() => onPrefetch?.(to)}
      className="group pressable block rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex items-center justify-between">
        <Icon className={cn("h-4 w-4", iconClass)} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={hint}>
        {hint}
      </p>
    </Link>
  );
}

/** Collapsible group used for the quieter, below-the-fold home sections. */
export function HomeCollapsibleSection({
  title,
  ariaLabel,
  defaultOpen = false,
  actions,
  children,
}: {
  title: string;
  ariaLabel?: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      aria-label={ariaLabel ?? title}
      className="overflow-hidden rounded-xl border border-border/60 bg-card/20"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden
          />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {open ? (
        <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
