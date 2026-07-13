import { Check, Circle, BookmarkCheck, Wand2, FolderOpen, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentFlowStep } from "./contentFlow";

const STEPS: { id: ContentFlowStep; label: string; hint: string; icon: typeof FolderOpen }[] = [
  { id: "browse", label: "1. Bläddra", hint: "Markera Drive-filer eller ladda upp från datorn.", icon: FolderOpen },
  { id: "selected", label: "2. Valda", hint: "Granska dina val — lägg till från Historik eller Drive när som helst.", icon: BookmarkCheck },
  { id: "create", label: "3. Skapa", hint: "Generera eller transformera med vald media.", icon: Wand2 },
  { id: "publish", label: "4. Publicera", hint: "Moderering körs automatiskt; konton är förvalda.", icon: Send },
];

export function ContentFlowGuide({
  active,
  selectionCount,
  onGo,
}: {
  active: ContentFlowStep;
  selectionCount: number;
  onGo: (step: ContentFlowStep) => void;
}) {
  const activeIndex = STEPS.findIndex((s) => s.id === active);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Så fungerar det</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const done =
            step.id === "browse"
              ? selectionCount > 0
              : step.id === "selected"
                ? selectionCount > 0 && index < activeIndex
                : index < activeIndex;
          const isActive = step.id === active;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onGo(step.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                isActive ? "border-primary bg-primary/5" : "border-border/80 hover:border-primary/30 hover:bg-accent/30"
              )}
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground">
                    {isActive ? <Icon className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  </span>
                )}
                <span className="text-sm font-medium">{step.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.hint}</p>
              {step.id === "selected" && selectionCount > 0 ? (
                <p className="mt-1 text-[11px] font-medium text-primary">{selectionCount} i Valda</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
