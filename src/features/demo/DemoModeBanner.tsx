import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDemoMode } from "./useDemoMode";

type Props = {
  className?: string;
  /** Compact CTA when demo is off (empty states / first-win). */
  offerEnable?: boolean;
};

/**
 * Banner to enter/exit client-only sandbox (sample inbox + draft queues).
 */
export function DemoModeBanner({ className, offerEnable }: Props) {
  const { enabled, isLoading, enable, disable } = useDemoMode();

  if (isLoading) return null;

  if (!enabled && offerEnable) {
    return (
      <section
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 sm:px-4",
          className
        )}
        aria-label="Prova utan att koppla"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Prova utan att koppla konton</p>
              <p className="text-xs text-muted-foreground leading-snug">
                Visa exempelmail, DM:s och AI-utkast så du ser hur Brief och Meddelanden funkar.
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={enable}>
            Starta demoläge
          </Button>
        </div>
      </section>
    );
  }

  if (!enabled) return null;

  return (
    <section
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 sm:px-4",
        className
      )}
      aria-label="Demoläge aktivt"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FlaskConical className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <p className="text-xs text-foreground">
            <span className="font-medium">Demoläge</span>
            <span className="text-muted-foreground">
              {" "}
              — exempeldata. Inget skickas på riktigt. Stäng när du kopplat egna konton.
            </span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={disable}
          aria-label="Stäng demoläge"
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Stäng
        </Button>
      </div>
    </section>
  );
}
