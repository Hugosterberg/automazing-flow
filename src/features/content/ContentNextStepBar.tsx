import { ArrowRight, BookmarkCheck, History, Send, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentTab } from "./contentFlow";

export function ContentNextStepBar({
  active,
  selectionCount,
  historyCount = 0,
  onGo,
}: {
  active: ContentTab;
  selectionCount: number;
  historyCount?: number;
  onGo: (step: ContentTab) => void;
}) {
  if (selectionCount === 0 && historyCount === 0 && active !== "browse") return null;

  const next =
    active === "browse"
      ? selectionCount > 0
        ? { step: "selected" as const, label: "Granska valda", icon: BookmarkCheck }
        : null
      : active === "selected"
        ? { step: "create" as const, label: "Skapa med AI", icon: Wand2 }
        : active === "create"
          ? { step: "publish" as const, label: "Publicera eller spara", icon: Send }
          : active === "history"
            ? selectionCount > 0
              ? { step: "selected" as const, label: "Öppna valda", icon: BookmarkCheck }
              : { step: "publish" as const, label: "Publicera eller spara", icon: Send }
            : null;

  if (!next && active !== "browse") return null;

  const Icon = next?.icon ?? BookmarkCheck;

  return (
    <div className="sticky bottom-[calc(var(--app-tab-bar-offset,4.25rem)+0.5rem+env(safe-area-inset-bottom,0px))] z-10 flex justify-center px-2 md:bottom-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {selectionCount > 0
            ? `${selectionCount} valda · nästa steg`
            : active === "history"
              ? `${historyCount} i historik · nästa steg`
              : active === "browse"
                ? "Markera filer i Drive för att lägga till i Valda"
                : "Nästa steg"}
        </span>
        {next ? (
          <Button size="sm" className="rounded-full h-8" onClick={() => onGo(next.step)}>
            <Icon className="h-3.5 w-3.5 mr-1.5" />
            {next.label}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        ) : null}
        {active === "browse" && selectionCount > 0 ? (
          <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs" onClick={() => onGo("create")}>
            Hoppa till skapa
          </Button>
        ) : null}
        {active === "selected" ? (
          <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs" onClick={() => onGo("publish")}>
            Hoppa över skapa
          </Button>
        ) : null}
        {active === "history" && selectionCount === 0 ? (
          <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs" onClick={() => onGo("create")}>
            <History className="h-3 w-3 mr-1" />
            Skapa mer
          </Button>
        ) : null}
      </div>
    </div>
  );
}
