import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { OAuthErrorDetails } from "@/lib/oauthErrors";
import { cn } from "@/lib/utils";

type OAuthErrorAlertProps = {
  details: OAuthErrorDetails;
  message: string;
  onDismiss: () => void;
};

export function OAuthErrorAlert({ details, message, onDismiss }: OAuthErrorAlertProps) {
  const [techOpen, setTechOpen] = useState(false);
  const hasStatus = Boolean(details.statusCode && details.statusCode !== "not provided");
  const hasException = Boolean(details.exception && details.exception !== "not provided");
  const hasTechnical = hasStatus || hasException;

  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 space-y-2"
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-destructive leading-snug">
            Kopplingen kunde inte slutföras
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">{message}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Stäng felmeddelande"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-11 text-xs text-muted-foreground">
        <span>
          Kod: <code className="rounded bg-muted px-1 py-0.5 text-foreground font-mono text-[11px]">{details.code}</code>
        </span>
        <Link to="/connections" className="text-primary underline-offset-2 hover:underline font-medium">
          Öppna anslutningar
        </Link>
        <Link to="/preferences" className="text-primary underline-offset-2 hover:underline font-medium">
          API-inställningar
        </Link>
      </div>

      {details.hint ? (
        <div className="pl-11">
          <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-destructive/30 pl-2.5">
            <span className="font-medium text-foreground/90">Tips:</span> {details.hint}
          </p>
        </div>
      ) : null}

      {hasTechnical ? (
        <div className="pl-11">
          <Collapsible open={techOpen} onOpenChange={setTechOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground",
                  "rounded-md py-1 px-1 -ml-1"
                )}
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", techOpen && "rotate-180")}
                  aria-hidden
                />
                Tekniska detaljer
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-2 text-xs text-muted-foreground">
              {hasStatus ? (
                <p>
                  <span className="font-medium text-foreground/85">HTTP-status:</span>{" "}
                  <code className="rounded bg-muted px-1 py-0.5">{details.statusCode}</code>
                </p>
              ) : null}
              {hasException ? (
                <p className="break-words">
                  <span className="font-medium text-foreground/85">Undantag:</span>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{details.exception}</code>
                </p>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}
