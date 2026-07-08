import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageBody } from "./MessageBody";
import type { ThreadMessage, UnifiedMessage } from "./types";

type Props = {
  messages: ThreadMessage[];
  loading?: boolean;
  highlightId?: string;
  kind: UnifiedMessage["kind"];
};

function formatThreadDate(raw: string): string {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("sv-SE", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
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
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading conversation…
      </div>
    );
  }

  if (messages.length <= 1) {
    return null;
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Conversation · {messages.length} messages
      </p>
      <ol className="space-y-3">
        {messages.map((msg) => {
          const highlighted = highlightId === msg.id;
          const outgoing = Boolean(msg.isOutgoing);
          return (
            <li
              key={msg.id}
              className={cn(
                "rounded-xl border px-4 py-3 transition-colors",
                highlighted ? "border-primary/40 bg-primary/5 ring-1 ring-primary/15" : "border-border/70 bg-muted/15",
                outgoing && "ml-6 sm:ml-10"
              )}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{msg.isOutgoing ? "You" : msg.from.name || "Contact"}</p>
                  {kind === "email" && msg.subject ? (
                    <p className="truncate text-xs text-muted-foreground">{msg.subject}</p>
                  ) : null}
                </div>
                <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
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
