import { cn } from "@/lib/utils";

type MessageStatusBarProps = {
  selectedLabel?: string | null;
  className?: string;
};

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border/70 bg-muted/40 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function MessageStatusBar({ selectedLabel, className }: MessageStatusBarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground sm:px-4",
        className
      )}
    >
      <span className="truncate">
        {selectedLabel ? (
          <>
            Vald: <span className="font-medium text-foreground/80">{selectedLabel}</span>
          </>
        ) : (
          "Välj ett meddelande i listan"
        )}
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-1">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> nav
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>E</Kbd> klar
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Shift</Kbd>+<Kbd>J</Kbd>/<Kbd>K</Kbd> öppna
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>R</Kbd> svar
        </span>
        <span className="hidden sm:inline-flex items-center gap-1">
          <Kbd>/</Kbd> sök
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>N</Kbd> nästa öppna
        </span>
        <span className="hidden sm:inline-flex items-center gap-1">
          <Kbd>1</Kbd>–<Kbd>4</Kbd> filter
        </span>
        <span className="hidden md:inline-flex items-center gap-1">
          <Kbd>[</Kbd>/<Kbd>]</Kbd> kanal
        </span>
        <span className="hidden md:inline-flex items-center gap-1">
          <Kbd>Ctrl</Kbd>+<Kbd>↵</Kbd> skicka
        </span>
      </div>
    </div>
  );
}
