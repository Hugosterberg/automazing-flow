import { ArrowLeft, ChevronLeft, ChevronRight, Globe, Info, Mail, Pencil, Search, Target } from "lucide-react";
import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isoToLocalDateInputValue } from "@/lib/localDate";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_ORDER,
  isFollowUpDueToday,
  isFollowUpOverdue,
  type LeadStatus,
} from "./leadHelpers";
import type { Lead } from "./leadsService";

type Props = {
  lead: Lead;
  onBack?: () => void;
  showBack?: boolean;
  onStatusChange: (status: LeadStatus) => void;
  onFollowUpChange: (value: string) => void;
  onDraftOutreach?: () => void;
  onResearch?: () => void;
  onAddToPipeline?: () => void;
  onEdit?: () => void;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
};

const STATUS_TONE: Record<LeadStatus, string> = {
  new: "text-info",
  contacted: "text-primary",
  qualified: "text-warning",
  won: "text-success",
  lost: "text-muted-foreground",
};

export function LeadFollowUpDetailPanel({
  lead,
  onBack,
  showBack,
  onStatusChange,
  onFollowUpChange,
  onDraftOutreach,
  onResearch,
  onAddToPipeline,
  onEdit,
  navigation,
}: Props) {
  const overdue = isFollowUpOverdue(lead.nextFollowUpAt);
  const dueToday = isFollowUpDueToday(lead.nextFollowUpAt);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 bg-card/20 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-start gap-2">
          {showBack && onBack ? (
            <Button type="button" variant="ghost" size="sm" className="mt-0.5 h-8 w-8 shrink-0 p-0 lg:hidden" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Tillbaka till listan</span>
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-base font-semibold leading-snug tracking-tight sm:text-lg">{lead.company}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {overdue ? (
                <Badge variant="outline" className="h-5 border-destructive/40 bg-destructive/10 text-[10px] text-destructive">
                  Försenad uppföljning
                </Badge>
              ) : dueToday ? (
                <Badge variant="outline" className="h-5 border-warning/40 bg-warning/10 text-[10px] text-warning">
                  Uppföljning idag
                </Badge>
              ) : null}
              {lead.source ? <span className="font-mono text-[11px]">{lead.source}</span> : null}
            </div>
          </div>
          {navigation ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={!navigation.hasPrev} onClick={navigation.onPrev} aria-label="Föregående lead">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-muted-foreground">
                {navigation.index + 1}/{navigation.total}
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={!navigation.hasNext} onClick={navigation.onNext} aria-label="Nästa lead">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="w-full space-y-4">
          <div className="message-reading-card px-4 py-3 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kontakt</p>
            <dl className="grid gap-2 text-sm">
              {lead.contactName ? (
                <div>
                  <dt className="text-[10px] text-muted-foreground">Kontaktperson</dt>
                  <dd>{lead.contactName}</dd>
                </div>
              ) : null}
              {lead.email ? (
                <div>
                  <dt className="text-[10px] text-muted-foreground">E-post</dt>
                  <dd>{lead.email}</dd>
                </div>
              ) : null}
              {lead.phone ? (
                <div>
                  <dt className="text-[10px] text-muted-foreground">Telefon</dt>
                  <dd>{lead.phone}</dd>
                </div>
              ) : null}
              {lead.website ? (
                <div>
                  <dt className="text-[10px] text-muted-foreground">Webbplats</dt>
                  <dd>
                    <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Globe className="h-3 w-3" />
                      {lead.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="message-reading-card px-4 py-3 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status & datum</p>
            <div className="flex flex-wrap gap-2">
              <Select value={lead.status} onValueChange={(v) => onStatusChange(v as LeadStatus)}>
                <SelectTrigger className={cn("h-8 w-[140px] text-xs", STATUS_TONE[lead.status])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {LEAD_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                aria-label={`Uppföljningsdatum för ${lead.company}`}
                value={lead.nextFollowUpAt ? isoToLocalDateInputValue(lead.nextFollowUpAt) : ""}
                onChange={(e) => onFollowUpChange(e.target.value)}
                className={cn(
                  "h-8 w-[150px] text-xs",
                  overdue && "border-destructive text-destructive",
                  dueToday && "border-warning text-warning"
                )}
              />
            </div>
          </div>

          {lead.notes ? (
            <div className="message-reading-card px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Anteckningar</p>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{lead.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/80 bg-card/20 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex flex-wrap gap-2">
          {onDraftOutreach ? (
            <Button type="button" size="sm" className="h-8 text-xs" onClick={onDraftOutreach}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Skriv utkast
            </Button>
          ) : null}
          {onResearch ? (
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onResearch}>
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Research
            </Button>
          ) : null}
          {onAddToPipeline ? (
            <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={onAddToPipeline}>
              <Target className="mr-1.5 h-3.5 w-3.5" />
              Lägg i pipeline
            </Button>
          ) : null}
          {onEdit ? (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Redigera
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

export function LeadFollowUpDetailPlaceholder() {
  return (
    <div className="message-reading-pane flex h-full min-h-[280px] flex-col items-center justify-center gap-5 px-6 text-center">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 shadow-sm"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 ring-1 ring-warning/15">
          <Info className="h-6 w-6 text-warning/80" />
        </div>
      </m.div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">Välj en lead</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Uppdatera status, skriv outreach-utkast och planera nästa steg — listan stannar kvar till vänster.
        </p>
      </div>
    </div>
  );
}
