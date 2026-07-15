import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateCustom } from "@/lib/format";
import { MessageBody } from "./MessageBody";
import type { ThreadMessage, UnifiedMessage } from "./types";

type Props = {
  messages: ThreadMessage[];
  loading?: boolean;
  highlightId?: string;
  kind: UnifiedMessage["kind"];
};

function formatThreadDate(raw: string): string {
  return formatDateCustom(raw, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function threadMessageAsUnified(msg: ThreadMessage, kind: UnifiedMessage["kind"]): UnifiedMessage {
  return {
    id: msg.id,
    kind,
    channel: kind === "email" ? "email" : "dm",
    accountId: "",
    accountLabel: "",
    subject: msg.subject || "",
    from: msg.from,
    date: msg.date,
    snippet: msg.snippet,
    body: msg.body,
    isUnread: false,
    providerMessageId: msg.id,
  };
}

export function MessageThread({ messages, loading, highlightId, kind }: Props) {
  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laddar konversation…
      </div>
    );
  }

  if (messages.length <= 1) {
    return null;
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Uppdaterar tråd…
        </p>
      ) : (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px]">
          Konversation · {messages.length} meddelanden
        </p>
      )}
      <ol className="space-y-2 sm:space-y-2">
        {messages.map((msg) => {
          const highlighted = highlightId === msg.id;
          const outgoing = Boolean(msg.isOutgoing);
          return (
            <li
              key={msg.id}
              className={cn(
                "message-reading-card px-3 py-2.5 transition-colors sm:px-3 sm:py-2",
                highlighted ? "border-primary/40 bg-primary/5 ring-1 ring-primary/15" : "",
                outgoing && "ml-3 border-primary/20 bg-primary/[0.03] sm:ml-8"
              )}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5 sm:mb-1">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold sm:text-xs sm:font-medium">
                    {msg.isOutgoing ? "Du" : msg.from.name || "Kontakt"}
                  </p>
                  {kind === "email" && msg.subject ? (
                    <p className="truncate text-[11px] text-muted-foreground sm:text-[10px]">{msg.subject}</p>
                  ) : null}
                </div>
                <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground sm:text-[10px]">
                  {formatThreadDate(msg.date)}
                </time>
              </div>
              <MessageBody message={threadMessageAsUnified(msg, kind)} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
