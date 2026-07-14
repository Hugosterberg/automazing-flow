import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatFullDateTime } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useStackedWorkspace } from "@/hooks/use-mobile";
import { resolveActivitySubjectLink } from "./resolveActivitySubjectLink";
import type { ActivityEventRow } from "./useActivityFeed";

const SEVERITY_LABELS: Record<ActivityEventRow["severity"], string> = {
  info: "Info",
  success: "Lyckades",
  warning: "Varning",
  error: "Fel",
};

const SEVERITY_BADGE: Record<ActivityEventRow["severity"], string> = {
  info: "border-border/60 bg-muted/30 text-muted-foreground",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

const formatFullDate = formatFullDateTime;

type Props = {
  event: ActivityEventRow;
  onBack?: () => void;
  showBack?: boolean;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
};

export function ActivityDetailPanel({ event, onBack, showBack, navigation }: Props) {
  const isStackedWorkspace = useStackedWorkspace();
  const when = formatRelativeTime(event.occurred_at) ?? formatFullDate(event.occurred_at);
  const subjectLink = resolveActivitySubjectLink(event.subject_type, event.subject_id);
  const payload =
    event.payload && typeof event.payload === "object" && Object.keys(event.payload as object).length > 0
      ? JSON.stringify(event.payload, null, 2)
      : null;

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
              {isStackedWorkspace ? <span>Logg</span> : <span className="sr-only">Tillbaka till listan</span>}
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-base font-semibold leading-snug tracking-tight sm:text-lg">{event.summary}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={cn("h-5 text-[10px] uppercase", SEVERITY_BADGE[event.severity])}>
                {SEVERITY_LABELS[event.severity]}
              </Badge>
              <Badge variant="secondary" className="h-5 font-mono text-[10px]">
                {event.module}
              </Badge>
              {event.event_type ? <span className="font-mono text-[11px]">{event.event_type}</span> : null}
              {when ? (
                <>
                  <span aria-hidden>·</span>
                  <time dateTime={event.occurred_at} title={formatFullDate(event.occurred_at)}>
                    {when}
                  </time>
                </>
              ) : null}
            </div>
          </div>
          {navigation ? (
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-muted/20 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(isStackedWorkspace ? "h-10 w-10" : "h-8 w-8", "p-0")}
                disabled={!navigation.hasPrev}
                onClick={navigation.onPrev}
                aria-label="Föregående händelse"
              >
                <ChevronLeft className={cn("h-4 w-4", isStackedWorkspace && "h-5 w-5")} />
              </Button>
              <span
                className={cn(
                  "min-w-[3rem] text-center tabular-nums text-muted-foreground",
                  isStackedWorkspace ? "text-xs" : "text-[11px]"
                )}
              >
                {navigation.index + 1}/{navigation.total}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(isStackedWorkspace ? "h-10 w-10" : "h-8 w-8", "p-0")}
                disabled={!navigation.hasNext}
                onClick={navigation.onNext}
                aria-label="Nästa händelse"
              >
                <ChevronRight className={cn("h-4 w-4", isStackedWorkspace && "h-5 w-5")} />
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="w-full space-y-4">
          {(event.subject_type || event.subject_id) && (
            <div className="message-reading-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ämne</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {event.subject_type ?? "—"}
                {event.subject_id ? ` · ${event.subject_id}` : ""}
              </p>
              {subjectLink ? (
                <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
                  <Link to={subjectLink.to}>
                    <ExternalLink className="mr-1.5 h-3 w-3" />
                    {subjectLink.label}
                  </Link>
                </Button>
              ) : null}
            </div>
          )}

          <div className="message-reading-card px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Händelse</p>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground">{event.summary}</p>
          </div>

          {payload ? (
            <div className="message-reading-card overflow-hidden">
              <p className="border-b border-border/50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Detaljer
              </p>
              <pre className="max-h-80 overflow-auto p-4 text-xs leading-relaxed text-muted-foreground">{payload}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActivityDetailPlaceholder() {
  return (
    <div className="message-reading-pane flex h-full min-h-[280px] flex-col items-center justify-center gap-5 px-6 text-center">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 shadow-sm"
      >
        <div className="hidden h-20 w-14 rounded-lg border border-border/50 bg-muted/30 sm:block" aria-hidden />
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <Info className="h-6 w-6 text-primary/70" />
        </div>
        <div className="hidden h-20 w-24 rounded-lg border border-border/50 bg-muted/20 sm:block" aria-hidden />
      </m.div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">Välj en händelse</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Listan stannar kvar till vänster — läs detaljer och metadata utan att tappa kontexten.
        </p>
      </div>
    </div>
  );
}
