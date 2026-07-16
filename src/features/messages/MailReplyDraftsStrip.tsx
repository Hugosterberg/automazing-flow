import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileDocument } from "@/features/profile-documents";
import { isDemoId } from "@/features/demo";
import { formatRelativeTime } from "@/lib/relativeTime";
import { sendMailReplyDraft } from "./mailReplyClient";

export type MailReplyQueueItem = {
  id: string;
  messageKey: string;
  accountId: string;
  platform: "gmail" | "outlook";
  providerMessageId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  draft: string;
  status: "draft" | "sent" | "dismissed";
  createdAt: string;
};

type Props = {
  businessProfileId: string | null | undefined;
  className?: string;
  onUseDraft?: (draft: string, messageHint?: { subject: string; fromName: string }) => void;
};

/**
 * Pending automated mail reply drafts (profile document queue).
 * Draft-before-send — user must confirm before anything is sent.
 */
export function MailReplyDraftsStrip({ businessProfileId, className, onUseDraft }: Props) {
  const queueDoc = useProfileDocument<MailReplyQueueItem[]>("mail-reply-queue", []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<MailReplyQueueItem | null>(null);

  const drafts = (Array.isArray(queueDoc.data) ? queueDoc.data : []).filter((d) => d?.status === "draft");

  const markStatus = useCallback(
    (id: string, status: "sent" | "dismissed") => {
      const next = (Array.isArray(queueDoc.data) ? queueDoc.data : []).map((item) =>
        item.id === id ? { ...item, status } : item
      );
      queueDoc.save(next);
    },
    [queueDoc]
  );

  const dismiss = useCallback(
    (id: string) => {
      setBusyId(id);
      try {
        markStatus(id, "dismissed");
        toast.success("Utkast borttaget");
      } finally {
        setBusyId(null);
      }
    },
    [markStatus]
  );

  const sendConfirmed = useCallback(async () => {
    if (!confirmItem || !businessProfileId) return;
    const item = confirmItem;
    setConfirmItem(null);
    setBusyId(item.id);
    try {
      if (isDemoId(item.id)) {
        markStatus(item.id, "sent");
        toast.success("Demo — inget skickades på riktigt");
        return;
      }
      await sendMailReplyDraft({ item, businessProfileId });
      markStatus(item.id, "sent");
      toast.success("Svaret skickades");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skicka mail-svar.");
    } finally {
      setBusyId(null);
    }
  }, [businessProfileId, confirmItem, markStatus]);

  if (!businessProfileId || queueDoc.isLoading || drafts.length === 0) return null;

  const visible = drafts.slice(0, 3);
  const rest = drafts.length - visible.length;

  return (
    <>
      <section
        className={cn(
          "rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 sm:px-4",
          className
        )}
        aria-label="Mail-utkast att granska"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {drafts.length === 1 ? "1 mail-utkast väntar" : `${drafts.length} mail-utkast väntar`}
              </p>
              <p className="text-xs text-muted-foreground">
                Automatiska svar — granska och skicka, eller klistra in i svarsfältet.
              </p>
            </div>
          </div>
          <Button asChild type="button" size="sm" variant="ghost" className="h-7 shrink-0 text-xs">
            <Link to="/automations?tab=messages&focus=mail-reply-auto">Automationer</Link>
          </Button>
        </div>

        <ul className="mt-2 space-y-1.5">
          {visible.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-medium">
                  {entry.fromName || entry.fromEmail || "Okänd"}
                  <span className="ml-1.5 font-normal text-muted-foreground">· {entry.subject}</span>
                  {entry.createdAt ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {formatRelativeTime(entry.createdAt) ?? ""}
                    </span>
                  ) : null}
                </p>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busyId === entry.id}
                    onClick={() => setConfirmItem(entry)}
                  >
                    {busyId === entry.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Skicka
                  </Button>
                  {onUseDraft ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() =>
                        onUseDraft(entry.draft, { subject: entry.subject, fromName: entry.fromName })
                      }
                    >
                      Använd utkast
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    disabled={busyId === entry.id}
                    onClick={() => dismiss(entry.id)}
                    aria-label="Ta bort utkast"
                  >
                    {busyId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">{entry.draft}</p>
            </li>
          ))}
        </ul>
        {rest > 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">+{rest} till i kön</p>
        ) : null}
      </section>

      <AlertDialog open={Boolean(confirmItem)} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka mail-svar?</AlertDialogTitle>
            <AlertDialogDescription>
              Svaret skickas till{" "}
              <span className="font-medium text-foreground">
                {confirmItem?.fromName || confirmItem?.fromEmail || "mottagaren"}
              </span>
              {confirmItem?.subject ? (
                <>
                  {" "}
                  angående <span className="font-medium text-foreground">{confirmItem.subject}</span>
                </>
              ) : null}
              . Det går inte att ångra ett skickat mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => void sendConfirmed()}>Skicka svar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
