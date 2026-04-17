import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="border-destructive/35 bg-destructive/5 shadow-sm" role="alert">
      <CardContent className="py-3.5 px-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive leading-snug">{message}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              Code: <code className="rounded bg-muted px-1 py-0.5 text-foreground">{details.code}</code>
            </span>
            <Link to="/integrations" className="text-primary underline-offset-2 hover:underline font-medium">
              Connection map
            </Link>
            <Link to="/preferences" className="text-primary underline-offset-2 hover:underline font-medium">
              API keys
            </Link>
          </div>
          {details.hint ? (
            <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-destructive/30 pl-2">
              <span className="font-medium text-foreground/90">Hint:</span> {details.hint}
            </p>
          ) : null}
          {hasTechnical ? (
            <Collapsible open={techOpen} onOpenChange={setTechOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground",
                    "rounded-md py-1 -ml-1 px-1 -my-1"
                  )}
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", techOpen && "rotate-180")}
                    aria-hidden
                  />
                  Technical details
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                {hasStatus ? (
                  <p>
                    <span className="font-medium text-foreground/85">Status:</span>{" "}
                    <code className="rounded bg-muted px-1 py-0.5">{details.statusCode}</code>
                  </p>
                ) : null}
                {hasException ? (
                  <p className="break-words">
                    <span className="font-medium text-foreground/85">Exception:</span>{" "}
                    <code className="rounded bg-muted px-1 py-0.5">{details.exception}</code>
                  </p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss} className="shrink-0 self-start">
          Dismiss
        </Button>
      </CardContent>
    </Card>
  );
}
