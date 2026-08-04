import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildShortcutSections, modKeyLabel } from "@/lib/keyboardShortcuts";
import { cn } from "@/lib/utils";

function ShortcutKbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

type KeyboardShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const location = useLocation();
  const modKey = modKeyLabel();

  const sections = useMemo(() => {
    const all = buildShortcutSections(modKey);
    const contextual = all.filter(
      (section) =>
        !section.routes ||
        section.routes.some(
          (route) => location.pathname === route || location.pathname.startsWith(`${route}/`)
        )
    );
    return contextual.length > 1 ? contextual : all.filter((section) => section.id === "global");
  }, [location.pathname, modKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tangentbordsgenvägar</DialogTitle>
          <DialogDescription>
            Snabbnavigering och åtgärder utan mus. Tryck{" "}
            <ShortcutKbd>?</ShortcutKbd> när som helst för att öppna denna lista.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-1">
          {sections.map((section) => (
            <section key={section.id}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.shortcuts.map((shortcut) => (
                  <li
                    key={`${section.id}-${shortcut.description}`}
                    className="flex items-start justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">{shortcut.description}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key, index) => (
                        <span key={`${shortcut.description}-${key}`} className="flex items-center gap-1">
                          {index > 0 ? (
                            <span className="text-[10px] text-muted-foreground/70">
                              {shortcut.keys[0] === "G" ? "→" : "+"}
                            </span>
                          ) : null}
                          <ShortcutKbd>{key}</ShortcutKbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className={cn("text-xs text-muted-foreground border-t border-border pt-3")}>
            Genvägar ignoreras när du skriver i ett textfält. Öppna kommandopaletten med{" "}
            <ShortcutKbd>{modKey}</ShortcutKbd>
            <span className="mx-0.5 text-muted-foreground/70">+</span>
            <ShortcutKbd>K</ShortcutKbd> för att hitta sidor och åtgärder.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
