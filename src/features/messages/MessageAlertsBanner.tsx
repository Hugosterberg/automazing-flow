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
  oauthMessage?: string | null;
  onDismissOAuth?: () => void;
  className?: string;
};

export function MessageAlertsBanner({
  error,
  onDismissError,
  mailErrors,
  onReconnectGmail,
  onReconnectOutlook,
  zernioNote,
  showZernioNote,
  oauthMessage,
  onDismissOAuth,
  className,
}: MessageAlertsBannerProps) {
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
            {me.platform === "gmail" ? "Gmail" : "Outlook"} — token utgånget. Koppla om för att ladda meddelanden.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => void (me.platform === "gmail" ? onReconnectGmail() : onReconnectOutlook())}
          >
            Koppla om
          </Button>
        </div>
      ))}
      {showZernioNote && zernioNote ? (
        <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Social DM-inkorg otillgänglig: {zernioNote}
        </p>
      ) : null}
    </div>
  );
}
