import { AlertTriangle, ChevronDown, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isOperatorConfigErrorCode, type OAuthErrorDetails } from "@/lib/oauthErrors";
import {
  isOAuthPermissionError,
  normalizeOAuthErrorCode,
  oauthPermissionGuidance,
} from "@/lib/oauthPermissionErrors";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type OAuthErrorAlertProps = {
  details: OAuthErrorDetails;
  message: string;
  onDismiss: () => void;
  platform?: string | null;
};

export function OAuthErrorAlert({ details, message, onDismiss, platform }: OAuthErrorAlertProps) {
  const [techOpen, setTechOpen] = useState(false);
  const permissionIssue = isOAuthPermissionError(details.code, details.hint);
  const normalizedCode = normalizeOAuthErrorCode(details.code, details.hint);
  const guidance = permissionIssue
    ? oauthPermissionGuidance({ code: details.code, hint: details.hint, platform })
    : null;
  const hasStatus = Boolean(details.statusCode && details.statusCode !== "not provided");
  const hasException = Boolean(details.exception && details.exception !== "not provided");
  // "_not_configured" (and a few dev-host-only codes) mean the app deployment
  // itself is missing setup — a tenant business owner can't act on env vars
  // or a provider's developer console, so swap in a generic message and move
  // the technical detail into "Tekniska detaljer" instead of showing it as
  // the primary, seemingly-actionable text.
  const operatorConfigIssue =
    isOperatorConfigErrorCode(normalizedCode) || isOperatorConfigErrorCode(details.code);
  const displayMessage = operatorConfigIssue ? t("errors:operatorConfigMessage") : message;
  const hasTechnical = hasStatus || hasException || details.code !== normalizedCode || operatorConfigIssue;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3.5 space-y-2",
        permissionIssue ? "border-warning/40 bg-warning/5" : "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
            permissionIssue ? "bg-warning/15" : "bg-destructive/10"
          )}
        >
          {permissionIssue ? (
            <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                permissionIssue ? "text-warning" : "text-destructive"
              )}
            >
              {permissionIssue ? "Behörighet saknas — kopplingen avbröts" : "Kopplingen kunde inte slutföras"}
            </p>
            {permissionIssue ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                Saknad behörighet
              </span>
            ) : null}
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{displayMessage}</p>
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

      {guidance ? (
        <div className="pl-11 space-y-2">
          <p className="text-xs font-medium text-foreground/90">{guidance.title}</p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
            {guidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guidance.dashboardUrl ? (
            <a
              href={guidance.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {guidance.dashboardLabel ?? "Öppna developer-portalen"}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-11 text-xs text-muted-foreground">
        <span>
          Kod:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground font-mono text-[11px]">
            {details.code}
          </code>
          {details.code !== normalizedCode ? (
            <>
              {" "}
              →{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground font-mono text-[11px]">
                {normalizedCode}
              </code>
            </>
          ) : null}
        </span>
        <Link to="/connections" className="text-primary underline-offset-2 hover:underline font-medium">
          Öppna Kopplingar
        </Link>
        <Link
          to="/preferences?tab=api-keys"
          className="text-muted-foreground underline-offset-2 hover:underline font-medium hover:text-foreground"
        >
          API-nycklar
        </Link>
      </div>

      {details.hint ? (
        <div className="pl-11">
          <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-warning/30 pl-2.5">
            <span className="font-medium text-foreground/90">Leverantören:</span> {details.hint}
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
              {operatorConfigIssue ? (
                <p className="break-words">
                  <span className="font-medium text-foreground/85">Konfiguration:</span> {message}
                </p>
              ) : null}
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
