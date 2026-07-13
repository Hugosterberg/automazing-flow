import { ArrowLeft, ChevronLeft, ChevronRight, Copy, ExternalLink, Info, Mail, Trash2 } from "lucide-react";
import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStackedWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { OutreachQueueItem } from "./outreachQueueTypes";

type Props = {
  item: OutreachQueueItem;
  onBack?: () => void;
  showBack?: boolean;
  onCopy: () => void;
  onMarkSent: () => void;
  onRemove: () => void;
  mailtoHref?: string | null;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
};

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("sv-SE", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function OutreachDetailPanel({
  item,
  onBack,
  showBack,
  onCopy,
  onMarkSent,
  onRemove,
  mailtoHref,
  navigation,
}: Props) {
  const isStackedWorkspace = useStackedWorkspace();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 bg-card/20 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-start gap-2">
          {showBack && onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "shrink-0 lg:hidden",
                isStackedWorkspace ? "h-10 gap-1.5 px-2 text-sm font-medium" : "mt-0.5 h-8 w-8 p-0"
              )}
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              {isStackedWorkspace ? <span>Kön</span> : <span className="sr-only">Tillbaka till listan</span>}
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-base font-semibold leading-snug tracking-tight sm:text-lg">{item.leadName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="h-5 text-[10px]">
                Utkast
              </Badge>
              {item.prospectEmail ? (
                <span className="truncate">{item.prospectEmail}</span>
              ) : (
                <span className="text-warning">Ingen e-post — kopiera manuellt</span>
              )}
              <span aria-hidden>·</span>
              <time dateTime={item.createdAt} title={formatFullDate(item.createdAt)}>
                {formatFullDate(item.createdAt)}
              </time>
            </div>
          </div>
          {navigation ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={!navigation.hasPrev} onClick={navigation.onPrev} aria-label="Föregående utkast">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-muted-foreground">
                {navigation.index + 1}/{navigation.total}
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={!navigation.hasNext} onClick={navigation.onNext} aria-label="Nästa utkast">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="w-full space-y-4">
          {item.subject ? (
            <div className="message-reading-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ämnesrad</p>
              <p className="mt-1 text-[15px] font-medium text-foreground">{item.subject}</p>
            </div>
          ) : null}
          <div className="message-reading-card px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Meddelande</p>
            <pre className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground font-sans">{item.body}</pre>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/80 bg-card/20 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onCopy}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Kopiera
          </Button>
          {mailtoHref ? (
            <Button type="button" size="sm" className="h-8 text-xs" asChild>
              <a href={mailtoHref}>
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                Öppna e-post
              </a>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={onMarkSent}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Markera skickad
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onRemove}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Ta bort
          </Button>
        </div>
      </footer>
    </div>
  );
}

export function OutreachDetailPlaceholder() {
  return (
    <div className="message-reading-pane flex h-full min-h-[280px] flex-col items-center justify-center gap-5 px-6 text-center">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 shadow-sm"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <Info className="h-6 w-6 text-primary/70" />
        </div>
      </m.div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">Välj ett utkast</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Granska, skicka via e-post och markera som skickat — listan stannar kvar till vänster.
        </p>
      </div>
    </div>
  );
}
