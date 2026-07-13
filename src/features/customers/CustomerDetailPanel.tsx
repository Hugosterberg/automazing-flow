import { ArrowLeft, Copy, ListChecks, MessageSquare, Send, User } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { guessPrimaryColumn } from "./customerColumns";
import { stashContentCaption } from "@/lib/contentCaptionHandoff";

export type CustomerRow = Record<string, string>;

function findEmailColumn(columns: string[], row: CustomerRow): string | null {
  for (const col of columns) {
    if (/email|e-post/i.test(col) && (row[col] || "").trim()) return (row[col] || "").trim();
  }
  return null;
}

function findPhoneColumn(columns: string[], row: CustomerRow): string | null {
  for (const col of columns) {
    if (/phone|telefon|tel|mobil/i.test(col) && (row[col] || "").trim()) return (row[col] || "").trim();
  }
  return null;
}

type Props = {
  row: CustomerRow;
  columns: string[];
  index: number;
  onBack?: () => void;
  showBack?: boolean;
};

function copyValue(label: string, value: string) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} kopierat.`))
    .catch(() => toast.error("Kunde inte kopiera."));
}

export function CustomerDetailPanel({ row, columns, index, onBack, showBack }: Props) {
  const primary = guessPrimaryColumn(columns);
  const title = (primary && row[primary]) || `Kund #${index + 1}`;
  const email = findEmailColumn(columns, row);
  const phone = findPhoneColumn(columns, row);

  function handoffOutreach() {
    const lines = [title, email, phone].filter(Boolean);
    stashContentCaption(lines.join("\n"));
    toast.success("Kundinfo skickad till Content — redo att publicera.");
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 bg-card/20 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-start gap-2">
          {showBack && onBack ? (
            <Button type="button" variant="ghost" size="sm" className="mt-0.5 h-8 w-8 shrink-0 p-0 md:hidden" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Tillbaka till listan</span>
            </Button>
          ) : null}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-background">
            <User className="h-5 w-5 text-primary/80" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-snug sm:text-lg">{title}</h2>
            <p className="text-xs text-muted-foreground">Rad {index + 1} i kundbasen</p>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-border/60 px-4 py-2 sm:px-5">
        <div className="flex flex-wrap gap-1.5">
          {email ? (
            <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
              <Link to={`/messages?search=${encodeURIComponent(email)}`}>
                <MessageSquare className="mr-1 h-3 w-3" />
                Sök i inkorg
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
            <Link to={`/tasks?new=1&title=${encodeURIComponent(`Följ upp: ${title}`)}`}>
              <ListChecks className="mr-1 h-3 w-3" />
              Skapa uppgift
            </Link>
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={handoffOutreach}>
            <Send className="mr-1 h-3 w-3" />
            Till Content
          </Button>
        </div>
      </div>

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <dl className="message-reading-card divide-y divide-border/50">
          {columns.map((col) => {
            const value = (row[col] || "").trim();
            const copyable = value && /email|e-post|phone|telefon|tel/i.test(col);
            return (
              <div key={col} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:w-36">
                  {col}
                </dt>
                <dd className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
                  {value ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn("break-words", !value && "text-muted-foreground")}>{value}</span>
                      {copyable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-muted-foreground"
                          onClick={() => copyValue(col, value)}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          Kopiera
                        </Button>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}

export function CustomerDetailPlaceholder() {
  return (
    <div className="message-reading-pane flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
        <User className="h-6 w-6 text-primary/70" />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">Välj en kund</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Klicka en rad i listan för att se alla fält — e-post och telefon går att kopiera med ett klick.
        </p>
      </div>
    </div>
  );
}
