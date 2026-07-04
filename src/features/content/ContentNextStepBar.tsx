import { ArrowRight, Send, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ContentFlowStep = "browse" | "create" | "publish";

export function ContentNextStepBar({
  active,
  selectionCount,
  onGo,
}: {
  active: ContentFlowStep;
  selectionCount: number;
  onGo: (step: ContentFlowStep) => void;
}) {
  if (selectionCount === 0) return null;

  const next =
    active === "browse"
      ? { step: "create" as const, label: "Create or enhance", icon: Wand2 }
      : active === "create"
        ? { step: "publish" as const, label: "Post or save", icon: Send }
        : null;

  if (!next) return null;

  const Icon = next.icon;

  return (
    <div className="sticky bottom-4 z-10 flex justify-center px-2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {selectionCount} selected · next step
        </span>
        <Button size="sm" className="rounded-full h-8" onClick={() => onGo(next.step)}>
          <Icon className="h-3.5 w-3.5 mr-1.5" />
          {next.label}
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
        {active === "browse" ? (
          <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs" onClick={() => onGo("publish")}>
            Skip create
          </Button>
        ) : null}
      </div>
    </div>
  );
}
