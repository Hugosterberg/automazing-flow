import { Link } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** Automations topic tab: messages | content | reports | insights */
  tab: "messages" | "content" | "reports" | "insights";
  /** Optional cron key — scrolls/highlights that card when supported. */
  focus?: string;
  title: string;
  description: string;
  ctaLabel?: string;
  className?: string;
  compact?: boolean;
};

/**
 * Points feature empty-states at the Automations page so users enable
 * existing cron jobs instead of doing the work by hand.
 */
export function AutomationEnableHint({
  tab,
  focus,
  title,
  description,
  ctaLabel = "Öppna Automationer",
  className,
  compact,
}: Props) {
  const params = new URLSearchParams();
  if (tab !== "messages") params.set("tab", tab);
  if (focus) params.set("focus", focus);
  const to = `/automations${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-3",
        compact && "px-3 py-2.5",
        className
      )}
    >
      <div className={cn("flex gap-3", compact ? "items-center" : "items-start")}>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Zap className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          <Button asChild size="sm" variant="secondary" className="h-8 gap-1.5 text-xs">
            <Link to={to}>
              {ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
