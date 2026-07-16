import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileDocument } from "@/features/profile-documents";
import { formatRelativeTime } from "@/lib/relativeTime";

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
 * Draft-before-send — never sends; user copies/uses draft in the reading pane.
 */
export function MailReplyDraftsStrip({ businessProfileId, className, onUseDraft }: Props) {
  const queueDoc = useProfileDocument<MailReplyQueueItem[]>("mail-reply-queue", []);
  const [busyId, setBusyId] = useState<string | null>(null);

  const drafts = (Array.isArray(queueDoc.data) ? queueDoc.data : []).filter((d) => d?.status === "draft");

  const dismiss = useCallback(
    (id: string) => {
      setBusyId(id);
      try {
        const next = (Array.isArray(queueDoc.data) ? queueDoc.data : []).map((item) =>
          item.id === id ? { ...item, status: "dismissed" as const } : item
        );
        queueDoc.save(next);
        toast.success("Utkast borttaget");
      } finally {
        setBusyId(null);
      }
    },
    [queueDoc]
  );

  if (!businessProfileId || queueDoc.isLoading || drafts.length === 0) return null;

  const visible = drafts.slice(0, 3);
  const rest = drafts.length - visible.length;

  return (
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
              Automatiska svar — öppna mailet och klistra in, eller aktivera under Automationer.
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
                {onUseDraft ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onUseDraft(entry.draft, { subject: entry.subject, fromName: entry.fromName })}
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
  );
}
