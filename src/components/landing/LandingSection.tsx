import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LandingSectionProps = {
  id?: string;
  title: string;
  description?: string;
  className?: string;
  framed?: boolean;
  children: ReactNode;
};

export function LandingSection({
  id,
  title,
  description,
  className,
  framed = true,
  children,
}: LandingSectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-24 min-w-0", className)}>
      <div
        className={cn(
          "min-w-0 space-y-5",
          framed && "landing-section-frame"
        )}
      >
        <div className="min-w-0 space-y-2">
          <div aria-hidden className="landing-section-accent" />
          <h2 className="landing-title-glow font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
