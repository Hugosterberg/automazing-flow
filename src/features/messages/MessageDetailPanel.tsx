import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Send,
  Sparkles,
} from "lucide-react";
import { m } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReplyTemplatePicker } from "@/features/reply-templates";
import { cn } from "@/lib/utils";
import { MessageBody } from "./MessageBody";
import { MessageThread } from "./MessageThread";
import type { ThreadMessage, UnifiedMessage } from "./types";

export type MessageDetailPanelProps = {
  message: UnifiedMessage;
  channelLabel: string;
  aiSummary?: string;
  threadMessages?: ThreadMessage[];
  threadLoading?: boolean;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  draftBusy: boolean;
  sendBusy: boolean;
  replySent: boolean;
  canReply: boolean;
  isHandled: boolean;
  onDraftReply: () => void;
  onSendReply: () => void;
  onMarkHandled: () => void;
  onNextAfterSend?: () => void;
  onBack?: () => void;
  showBack?: boolean;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
};

type Props = MessageDetailPanelProps;

function formatFullDate(raw: string): string {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("sv-SE", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

export function MessageDetailPanel({
  message,
  channelLabel,
  aiSummary,
  threadMessages = [],
  threadLoading = false,
  replyDraft,
  onReplyDraftChange,
  draftBusy,
  sendBusy,
  replySent,
  canReply,
  isHandled,
  onDraftReply,
  onSendReply,
  onMarkHandled,
  onNextAfterSend,
  onBack,
  showBack,
  navigation,
}: Props) {
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(Boolean(aiSummary));

  useEffect(() => {
    setSummaryOpen(Boolean(aiSummary));
  }, [message.id, aiSummary]);

  useEffect(() => {
    if (replySent || !canReply || draftBusy) return;
    const timer = window.setTimeout(() => replyRef.current?.focus(), 140);
    return () => window.clearTimeout(timer);
  }, [message.id, draftBusy, replySent, canReply]);

  const fromName = message.from.name || message.from.email || "Unknown";
  const fromEmail = message.from.email?.trim();

  function copyBody() {
    const text = (message.body || message.snippet || "").trim();
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Message copied."))
      .catch(() => toast.error("Could not copy."));
  }

  function copyEmail() {
    if (!fromEmail) return;
    void navigator.clipboard
      .writeText(fromEmail)
      .then(() => toast.success("Email address copied."))
      .catch(() => toast.error("Could not copy."));
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 px-4 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-start gap-2">
          {showBack && onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-0.5 h-8 w-8 shrink-0 p-0 lg:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to inbox</span>
            </Button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-base font-semibold leading-snug tracking-tight sm:text-lg">
                {message.subject || "(No subject)"}
              </h2>
              <div className="flex shrink-0 items-center gap-0.5">
                {navigation ? (
                  <div className="mr-0.5 flex items-center rounded-md border border-border/60 bg-muted/20 p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!navigation.hasPrev}
                      onClick={navigation.onPrev}
                      aria-label="Previous message"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[2.75rem] px-1 text-center text-[10px] tabular-nums text-muted-foreground">
                      {navigation.index + 1}/{navigation.total}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!navigation.hasNext}
                      onClick={navigation.onNext}
                      aria-label="Next message"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {message.externalUrl ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={message.externalUrl} target="_blank" rel="noreferrer" aria-label="Open in platform">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={copyBody} title="Copy message">
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">Copy message</span>
                </Button>
                {!isHandled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onMarkHandled}
                    title="Mark handled (E)"
                  >
                    <CheckCheck className="h-4 w-4" />
                    <span className="sr-only">Mark handled</span>
                  </Button>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-7 gap-1 border-emerald-500/40 px-2 text-[10px] uppercase text-emerald-600"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Done
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] uppercase tracking-wide">
                {message.kind === "email" ? <Mail className="h-3 w-3" /> : null}
                {channelLabel}
              </Badge>
              {message.accountLabel ? <span>{message.accountLabel}</span> : null}
              {message.date ? (
                <>
                  <span aria-hidden>·</span>
                  <time>{formatFullDate(message.date)}</time>
                </>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From</span>
              <span className="font-medium text-foreground">{fromName}</span>
              {fromEmail ? (
                <>
                  <span className="text-muted-foreground">&lt;{fromEmail}&gt;</span>
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={copyEmail}>
                    Copy
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="mx-auto max-w-3xl space-y-4">
          {aiSummary ? (
            <div className="rounded-lg border border-border/70 bg-muted/20">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                onClick={() => setSummaryOpen((v) => !v)}
                aria-expanded={summaryOpen}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-violet-500" />
                  AI summary
                </span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", summaryOpen && "rotate-180")}
                />
              </button>
              {summaryOpen ? (
                <p className="border-t border-border/60 px-3 pb-3 pt-2 text-sm leading-relaxed text-muted-foreground">
                  {aiSummary}
                </p>
              ) : null}
            </div>
          ) : null}

          {threadMessages.length > 1 || threadLoading ? (
            <MessageThread
              messages={threadMessages}
              loading={threadLoading}
              highlightId={message.providerMessageId || message.id}
              kind={message.kind}
            />
          ) : (
            <MessageBody message={message} />
          )}
        </div>
      </div>

      {canReply ? (
        <footer className="shrink-0 border-t border-border/80 bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <div className="mx-auto max-w-3xl">
            {replySent ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                  <Send className="h-4 w-4" />
                  Reply sent
                </p>
                {onNextAfterSend ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onNextAfterSend}>
                    Next message
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2.5">
                <Textarea
                  ref={replyRef}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  placeholder={
                    message.kind === "email"
                      ? "Write your reply… (AI draft loads automatically)"
                      : "Write a reply…"
                  }
                  className={cn(
                    "min-h-[84px] resize-none border-border/70 bg-background text-sm leading-relaxed",
                    "focus-visible:ring-primary/30"
                  )}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && replyDraft.trim() && !sendBusy) {
                      e.preventDefault();
                      onSendReply();
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={onDraftReply} disabled={draftBusy}>
                    {draftBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    AI draft
                  </Button>
                  <ReplyTemplatePicker
                    onInsert={onReplyDraftChange}
                    recipientName={message.from.name}
                    disabled={sendBusy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto h-8"
                    onClick={onSendReply}
                    disabled={sendBusy || !replyDraft.trim()}
                  >
                    {sendBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Send reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

export function MessageDetailPlaceholder() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 bg-gradient-to-b from-muted/20 to-background px-6 text-center">
      <m.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-dashed border-border/80 bg-card/50 p-6 shadow-sm"
      >
        <Mail className="mx-auto h-9 w-9 text-muted-foreground/50" />
      </m.div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Select a message</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Pick an item from the inbox to read it here — your list stays visible on the left.
        </p>
      </div>
      <div className="hidden rounded-lg border border-border/60 bg-muted/20 px-4 py-2 text-left lg:block">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Shortcuts</p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">J</kbd> /{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">K</kbd> — next / previous
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">E</kbd> — mark handled
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">/</kbd> — focus search
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Esc</kbd> — close message
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Ctrl</kbd>+
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Enter</kbd> — send reply
          </li>
        </ul>
      </div>
    </div>
  );
}
