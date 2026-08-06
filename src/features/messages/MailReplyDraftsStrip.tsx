import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

/** Profile-document key for the pending mail reply drafts queue. */
export const MAIL_REPLY_QUEUE_DOC_KEY = "mail-reply-queue";

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
  const { t } = useTranslation("messages");
  const queueDoc = useProfileDocument<MailReplyQueueItem[]>(MAIL_REPLY_QUEUE_DOC_KEY, []);
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
        toast.success(t("mailDrafts.dismissed"));
      } finally {
        setBusyId(null);
      }
    },
    [markStatus, t]
  );

  const sendConfirmed = useCallback(async () => {
    if (!confirmItem || !businessProfileId) return;
    const item = confirmItem;
    setConfirmItem(null);
    setBusyId(item.id);
    try {
      if (isDemoId(item.id)) {
        markStatus(item.id, "sent");
        toast.success(t("mailDrafts.demoSent"));
        return;
      }
      await sendMailReplyDraft({ item, businessProfileId });
      markStatus(item.id, "sent");
      toast.success(t("mailDrafts.sent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("mailDrafts.sendFailed"));
    } finally {
      setBusyId(null);
    }
  }, [businessProfileId, confirmItem, markStatus, t]);

  if (!businessProfileId || queueDoc.isLoading || drafts.length === 0) return null;

  const visible = drafts.slice(0, 3);
  const rest = drafts.length - visible.length;
  const confirmTo =
    confirmItem?.fromName || confirmItem?.fromEmail || t("mailDrafts.confirmRecipient");
  const subjectPart = confirmItem?.subject
    ? t("mailDrafts.confirmSubject", { subject: confirmItem.subject })
    : "";

  return (
    <>
      <section
        className={cn(
          "rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 sm:px-4",
          className
        )}
        aria-label={t("mailDrafts.aria")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("mailDrafts.title", { count: drafts.length })}</p>
              <p className="text-xs text-muted-foreground">{t("mailDrafts.subtitle")}</p>
            </div>
          </div>
          <Button asChild type="button" size="sm" variant="ghost" className="h-7 shrink-0 text-xs">
            <Link to="/automations?tab=messages&focus=mail-reply-auto">{t("mailDrafts.automations")}</Link>
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
                  {entry.fromName || entry.fromEmail || t("mailDrafts.unknown")}
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
                    {t("mailDrafts.send")}
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
                      {t("mailDrafts.useDraft")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    disabled={busyId === entry.id}
                    onClick={() => dismiss(entry.id)}
                    aria-label={t("mailDrafts.dismissAria")}
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
          <p className="mt-1.5 text-xs text-muted-foreground">{t("mailDrafts.moreInQueue", { count: rest })}</p>
        ) : null}
      </section>

      <AlertDialog open={Boolean(confirmItem)} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mailDrafts.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mailDrafts.confirmDesc", { to: confirmTo, subjectPart })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("mailDrafts.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void sendConfirmed()}>{t("mailDrafts.confirmSend")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
