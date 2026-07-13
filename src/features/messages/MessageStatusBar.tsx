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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-1">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> Next
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>H</Kbd> Handled
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Shift</Kbd>+<Kbd>J</Kbd>/<Kbd>K</Kbd> Open
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>R</Kbd> Reply
        </span>
        <span className="hidden sm:inline-flex items-center gap-1">
          <Kbd>/</Kbd> Search
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>N</Kbd> Next open
        </span>
        <span className="hidden sm:inline-flex items-center gap-1">
          <Kbd>Q</Kbd>/<Kbd>O</Kbd>/<Kbd>A</Kbd>/<Kbd>H</Kbd> filter
        </span>
        <span className="hidden md:inline-flex items-center gap-1">
          <Kbd>[</Kbd>/<Kbd>]</Kbd> channel
        </span>
        <span className="hidden md:inline-flex items-center gap-1">
          <Kbd>Ctrl</Kbd>+<Kbd>↵</Kbd> Send
        </span>
      </div>
    </div>
  );
}
