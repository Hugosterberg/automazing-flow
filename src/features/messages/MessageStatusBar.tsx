import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("messages");

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
            {t("statusBar.selected")}
            <span className="font-medium text-foreground/80">{selectedLabel}</span>
          </>
        ) : (
          t("statusBar.pick")
        )}
      </span>
      <div className="hidden flex-wrap items-center gap-x-2 gap-y-0.5 lg:flex">
        <span className="inline-flex items-center gap-1">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> {t("statusBar.next")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>H</Kbd> {t("statusBar.done")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>E</Kbd> {t("statusBar.archive")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Shift</Kbd>+<Kbd>J</Kbd>/<Kbd>K</Kbd> {t("statusBar.openNav")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>R</Kbd> {t("statusBar.reply")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>/</Kbd> {t("statusBar.search")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>N</Kbd> {t("statusBar.nextOpen")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Q</Kbd>/<Kbd>O</Kbd>/<Kbd>A</Kbd> {t("statusBar.filter")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>[</Kbd>/<Kbd>]</Kbd> {t("statusBar.channel")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Ctrl</Kbd>+<Kbd>↵</Kbd> {t("statusBar.send")}
        </span>
      </div>
    </div>
  );
}
