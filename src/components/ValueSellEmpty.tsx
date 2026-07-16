import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Cta = { label: string; to: string };

type Props = {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Trust / safety one-liner under the value prop. */
  trust?: string;
  primary: Cta;
  secondary?: Cta;
  className?: string;
};

/**
 * Value-selling empty block — outcome first, then connect CTA.
 * Pattern shared with MailConnectEmptyCards (no dashed EmptyState chrome).
 */
export function ValueSellEmpty({
  icon: Icon,
  title,
  description,
  trust,
  primary,
  secondary,
  className,
}: Props) {
  return (
    <section
      className={cn(
        "rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 sm:px-4",
        className
      )}
      aria-label={title}
    >
      <div className="flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
          {trust ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
              {trust}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild type="button" size="sm" className="h-8 text-xs">
              <Link to={primary.to}>{primary.label}</Link>
            </Button>
            {secondary ? (
              <Button asChild type="button" size="sm" variant="outline" className="h-8 text-xs">
                <Link to={secondary.to}>{secondary.label}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
