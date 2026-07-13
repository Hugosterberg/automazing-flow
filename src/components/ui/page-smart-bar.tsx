import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagePurposeStrip } from "@/components/ui/page-purpose-strip";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { usePageSmartHints, type SmartHintAction } from "@/hooks/usePageSmartHints";
import { cn } from "@/lib/utils";

type PageSmartBarProps = {
  title: string;
  steps?: string[];
  tip?: string;
  className?: string;
  /** When false, only static copy is shown (e.g. home). */
  smart?: boolean;
  /** Extra actions merged after brief-derived ones. */
  extraActions?: SmartHintAction[];
  /** Override live hint (page-specific data beats generic brief). */
  liveHintOverride?: string | null;
};

/** Hide keyboard-heavy tips on touch-first viewports — footers cover desktop shortcuts. */
function tipForViewport(tip: string | undefined, isDesktop: boolean) {
  if (!tip || isDesktop) return tip;
  if (/⌘|Ctrl|Shift|\+|\b[JHKRNQAEO]\b|<kbd/i.test(tip)) return undefined;
  return tip;
}

/**
 * PagePurposeStrip + live brief signals for the current route.
 * Keeps static onboarding copy while surfacing what needs action *now*.
 */
export function PageSmartBar({
  title,
  steps,
  tip,
  className,
  smart = true,
  extraActions = [],
  liveHintOverride,
}: PageSmartBarProps) {
  const isDesktop = useIsDesktopWorkspace();
  const hints = usePageSmartHints();
  const liveHint = liveHintOverride ?? (smart ? hints.liveHint : null);
  const actions = smart ? [...hints.actions, ...extraActions] : extraActions;
  const showLive = Boolean(liveHint && smart);
  const visibleTip = tipForViewport(tip, isDesktop);
  const maxActions = isDesktop ? 2 : 1;

  return (
    <div className={cn("space-y-2", className)}>
      <PagePurposeStrip title={title} steps={steps} tip={!showLive ? visibleTip : undefined} />
      {showLive ? (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3.5 sm:py-2.5",
            hints.allClear
              ? "border-success/30 bg-success/5"
              : "border-primary/25 bg-primary/5"
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            <Sparkles
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                hints.allClear ? "text-success" : "text-primary"
              )}
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground/90">{liveHint}</p>
          </div>
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {actions.slice(0, maxActions).map((action) => (
                <Button key={action.to + action.label} asChild size="sm" variant="secondary" className="h-7 text-[11px]">
                  <Link to={action.to}>
                    {action.label}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {showLive && visibleTip ? (
        <p className="hidden text-[11px] leading-relaxed text-muted-foreground/80 px-1 sm:block">{visibleTip}</p>
      ) : null}
    </div>
  );
}
