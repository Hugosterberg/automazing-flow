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
        "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4",
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
      <div className="hidden flex-wrap items-center gap-x-2 gap-y-0.5 lg:flex">
        <span className="inline-flex items-center gap-1">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> Nästa
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>H</Kbd> Klar
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>E</Kbd> Arkivera
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Shift</Kbd>+<Kbd>J</Kbd>/<Kbd>K</Kbd> Öppna
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>R</Kbd> Svara
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>/</Kbd> Sök
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>N</Kbd> Nästa öppen
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Q</Kbd>/<Kbd>O</Kbd>/<Kbd>A</Kbd> Filter
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>[</Kbd>/<Kbd>]</Kbd> Kanal
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Ctrl</Kbd>+<Kbd>↵</Kbd> Skicka
        </span>
      </div>
    </div>
  );
}
