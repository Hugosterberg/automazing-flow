import { ArrowLeft, Copy, ListChecks, MessageSquare, Send, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStackedWorkspace } from "@/hooks/use-mobile";
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

function copyValue(label: string, value: string, copiedLabel: string, copyFailedLabel: string) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(copiedLabel))
    .catch(() => toast.error(copyFailedLabel));
}

export function CustomerDetailPanel({ row, columns, index, onBack, showBack }: Props) {
  const { t } = useTranslation("customers");
  const isStackedWorkspace = useStackedWorkspace();
  const primary = guessPrimaryColumn(columns);
  const title = (primary && row[primary]) || t("detail.titleFallback", { number: index + 1 });
  const email = findEmailColumn(columns, row);
  const phone = findPhoneColumn(columns, row);

  function handoffOutreach() {
    const lines = [title, email, phone].filter(Boolean);
    stashContentCaption(lines.join("\n"));
    toast.success(t("toast.handoffContent"));
  }

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
              {isStackedWorkspace ? <span>{t("detail.backLabel")}</span> : <span className="sr-only">{t("detail.backToList")}</span>}
            </Button>
          ) : null}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-background">
            <User className="h-5 w-5 text-primary/80" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-snug sm:text-lg">{title}</h2>
            <p className="text-xs text-muted-foreground">{t("detail.rowMeta", { number: index + 1 })}</p>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-border/60 px-4 py-2 sm:px-5">
        <div className="flex flex-wrap gap-1.5">
          {email ? (
            <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
              <Link to={`/messages?search=${encodeURIComponent(email)}`}>
                <MessageSquare className="mr-1 h-3 w-3" />
                {t("detail.searchInbox")}
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
            <Link to={`/tasks?new=1&title=${encodeURIComponent(t("detail.taskTitle", { name: title }))}`}>
              <ListChecks className="mr-1 h-3 w-3" />
              {t("detail.createTask")}
            </Link>
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={handoffOutreach}>
            <Send className="mr-1 h-3 w-3" />
            {t("detail.toContent")}
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
                          onClick={() => copyValue(col, value, t("toast.copied", { label: col }), t("toast.copyFailed"))}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          {t("detail.copy")}
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
  const { t } = useTranslation("customers");
  return (
    <div className="message-reading-pane flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
        <User className="h-6 w-6 text-primary/70" />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">{t("placeholder.title")}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("placeholder.description")}
        </p>
      </div>
    </div>
  );
}
