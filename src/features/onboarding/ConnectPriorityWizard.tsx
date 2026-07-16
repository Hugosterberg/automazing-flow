import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, PlugZap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ProfileKind } from "@/types/businessProfile";
import { priorityConnectsForKind } from "./firstWin";

type Props = {
  kind: ProfileKind | null | undefined;
  connectedPlatforms: Iterable<string>;
  className?: string;
  /** When true, show even if some platforms are already connected. */
  force?: boolean;
};

/**
 * Prioritized 3-connect wizard for Connections — answers "what should I connect first?".
 */
export function ConnectPriorityWizard({ kind, connectedPlatforms, className, force }: Props) {
  const connected = new Set(
    [...connectedPlatforms].map((p) => String(p || "").toLowerCase())
  );
  const priorities = priorityConnectsForKind(kind);
  const remaining = priorities.filter((p) => !connected.has(p.platform));
  if (!force && remaining.length === 0 && connected.size > 0) return null;

  const items = force || remaining.length === 0 ? priorities : remaining;

  return (
    <Alert className={cn("border-primary/30 bg-primary/[0.04]", className)}>
      <PlugZap className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Börja här — tre kopplingar som ger värde snabbt
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <Sparkles className="h-3 w-3" aria-hidden />
          Rekommenderat
        </span>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          {kind === "personal"
            ? "För privatliv: mail + kalender (+ Instagram om du vill samla DM:s)."
            : "För företag: mail + Instagram (+ Shopify om du säljer online)."}{" "}
          Du kan lägga till fler senare — öppna kortet och följ den rekommenderade vägen.
        </p>
        <ul className="space-y-1.5">
          {items.map((item) => {
            const done = connected.has(item.platform);
            return (
              <li
                key={item.platform}
                className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex items-start gap-2">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{item.why}</p>
                  </div>
                </div>
                <Button asChild type="button" size="sm" variant={done ? "ghost" : "outline"} className="h-7 shrink-0 text-xs">
                  <Link to={`/connections?q=${encodeURIComponent(item.query)}`}>
                    {done ? "Öppna" : "Koppla"}
                    <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
