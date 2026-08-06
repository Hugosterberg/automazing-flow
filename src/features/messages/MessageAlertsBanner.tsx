import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MailError = { accountId: string; platform: string; error: string };

type MessageAlertsBannerProps = {
  error: string | null;
  onDismissError: () => void;
  mailErrors: MailError[];
  onReconnectGmail: () => void;
  onReconnectOutlook: () => void;
  zernioNote: string | null;
  showZernioNote: boolean;
  /** Deep link for social DM reconnect / Inbox add-on fix. */
  zernioConnectHref?: string;
  oauthMessage?: string | null;
  onDismissOAuth?: () => void;
  className?: string;
};

function isInboxAddonNote(note: string): boolean {
  return /INBOX_REQUIRED|inbox add-?on/i.test(note);
}

export function MessageAlertsBanner({
  error,
  onDismissError,
  mailErrors,
  onReconnectGmail,
  onReconnectOutlook,
  zernioNote,
  showZernioNote,
  zernioConnectHref = "/connections?session=instagram",
  oauthMessage,
  onDismissOAuth,
  className,
}: MessageAlertsBannerProps) {
  const { t } = useTranslation("messages");
  const hasContent =
    Boolean(error) || mailErrors.length > 0 || (showZernioNote && zernioNote) || Boolean(oauthMessage);
  if (!hasContent) return null;

  return (
    <div className={cn("shrink-0 space-y-1 border-b border-border/60 bg-muted/15 px-3 py-2 sm:px-4", className)}>
      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onDismissError}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : null}
      {oauthMessage ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{oauthMessage}</span>
          {onDismissOAuth ? (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onDismissOAuth}>
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {mailErrors.map((me) => (
        <div
          key={`${me.accountId}-${me.platform}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>
            {t("alerts.mailTokenExpired", {
              provider: me.platform === "gmail" ? "Gmail" : "Outlook",
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => void (me.platform === "gmail" ? onReconnectGmail() : onReconnectOutlook())}
          >
            {t("alerts.reconnect")}
          </Button>
        </div>
      ))}
      {showZernioNote && zernioNote ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          <div className="min-w-0 space-y-0.5">
            <p>{t("alerts.socialUnavailable", { note: zernioNote })}</p>
            {isInboxAddonNote(zernioNote) ? (
              <p className="text-[11px] text-amber-800 dark:text-amber-200">{t("alerts.inboxAddonHint")}</p>
            ) : null}
          </div>
          <Button asChild type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs">
            <Link to={zernioConnectHref}>{t("alerts.fixInbox")}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
