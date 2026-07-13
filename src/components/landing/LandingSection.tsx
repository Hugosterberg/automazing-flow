import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LandingSectionProps = {
  id?: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function LandingSection({
  id,
  title,
  description,
  className,
  children,
}: LandingSectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-24 space-y-5 min-w-0", className)}>
      <div className="min-w-0 space-y-1.5">
        <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
