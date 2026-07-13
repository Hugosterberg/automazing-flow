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
import { isHtmlEmailContent } from "./messageBodyHtml";
import { MessageThread } from "./MessageThread";
import { avatarGradient, formatFullMessageDate, senderInitial } from "./messagesUi";
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
  onUnmarkHandled?: () => void;
  onNextAfterSend?: () => void;
  onBack?: () => void;
  showBack?: boolean;
  needsAttention?: boolean;
  focusReplyRef?: React.MutableRefObject<(() => void) | null>;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
};

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
  onUnmarkHandled,
  onNextAfterSend,
  onBack,
  showBack,
  needsAttention = false,
  focusReplyRef,
  navigation,
}: MessageDetailPanelProps) {
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const rawBody = (message.body || message.snippet || "").trim();
  const htmlEmail = message.kind === "email" && isHtmlEmailContent(rawBody);
  const [summaryOpen, setSummaryOpen] = useState(Boolean(aiSummary) && needsAttention && !htmlEmail);

  useEffect(() => {
    if (!focusReplyRef) return;
    focusReplyRef.current = () => replyRef.current?.focus();
    return () => {
      focusReplyRef.current = null;
    };
  }, [focusReplyRef, message.id]);

  useEffect(() => {
    setSummaryOpen(Boolean(aiSummary) && needsAttention && !htmlEmail);
  }, [message.id, aiSummary, needsAttention, htmlEmail]);

  useEffect(() => {
    if (replySent || !canReply || draftBusy) return;
    const timer = window.setTimeout(() => replyRef.current?.focus(), 140);
    return () => window.clearTimeout(timer);
  }, [message.id, draftBusy, replySent, canReply]);

  const fromName = message.from.name || message.from.email || "Unknown";
  const fromEmail = message.from.email?.trim();
  const headerInitial = senderInitial(fromName);
  const headerAvatarGradient = avatarGradient(fromName || fromEmail || message.id);

  function copyBody() {
    const text = (message.body || message.snippet || "").trim();
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Meddelande kopierat."))
      .catch(() => toast.error("Kunde inte kopiera."));
  }

  function copyEmail() {
    if (!fromEmail) return;
    void navigator.clipboard
      .writeText(fromEmail)
      .then(() => toast.success("E-postadress kopierad."))
      .catch(() => toast.error("Kunde inte kopiera."));
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 bg-card/20 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex w-full items-start gap-3">
          {showBack && onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-0.5 h-8 w-8 shrink-0 p-0 md:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Tillbaka till inkorgen</span>
            </Button>
          ) : null}

          <div
            className={cn(
              "hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm ring-2 ring-background sm:flex",
              headerAvatarGradient
            )}
            aria-hidden
          >
            {headerInitial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-base font-semibold leading-snug tracking-tight sm:text-lg">
                {message.subject || "(Utan ämne)"}
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
                      aria-label="Föregående meddelande"
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
                      aria-label="Nästa meddelande"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {message.externalUrl ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={message.externalUrl} target="_blank" rel="noreferrer" aria-label="Öppna i plattformen">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={copyBody} title="Kopiera meddelande">
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">Kopiera meddelande</span>
                </Button>
                {!isHandled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onMarkHandled}
                    title="Markera hanterad (E)"
                  >
                    <CheckCheck className="h-4 w-4" />
                    <span className="sr-only">Markera hanterad</span>
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="h-7 gap-1 border-emerald-500/40 px-2 text-[10px] uppercase text-emerald-600"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Klar
                    </Badge>
                    {onUnmarkHandled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={onUnmarkHandled}
                        title="Flytta tillbaka till öppna"
                      >
                        Återöppna
                      </Button>
                    ) : null}
                  </div>
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
                  <time>{formatFullMessageDate(message.date)}</time>
                </>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Från</span>
              <span className="font-medium text-foreground">{fromName}</span>
              {fromEmail ? (
                <>
                  <span className="text-muted-foreground">&lt;{fromEmail}&gt;</span>
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={copyEmail}>
                    Kopiera
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {needsAttention && canReply && !replySent ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 bg-primary/5 px-4 py-2 sm:px-5">
          <span className="text-[11px] font-medium text-primary">Snabbåtgärder</span>
          <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={onMarkHandled}>
            <CheckCheck className="mr-1 h-3 w-3" />
            Markera klar
            <kbd className="ml-1.5 rounded border border-border/60 px-1 font-mono text-[9px] opacity-70">H</kbd>
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onDraftReply} disabled={draftBusy}>
            {draftBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
            AI-utkast
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => replyRef.current?.focus()}
          >
            Skriv svar
            <kbd className="ml-1.5 rounded border border-border/60 px-1 font-mono text-[9px] opacity-70">R</kbd>
          </Button>
        </div>
      ) : null}

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="w-full space-y-4">
          {aiSummary ? (
            <div className="overflow-hidden rounded-lg border border-violet-500/20 bg-violet-500/[0.04]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-500/[0.06]"
                onClick={() => setSummaryOpen((v) => !v)}
                aria-expanded={summaryOpen}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-violet-500" />
                  AI-sammanfattning
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
        <footer className="shrink-0 border-t border-border/80 bg-gradient-to-t from-card to-card/80 px-4 py-3 backdrop-blur-md sm:px-5">
          <div className="mx-auto w-full">
            {replySent ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                  <Send className="h-4 w-4" />
                  Svar skickat
                </p>
                {onNextAfterSend ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onNextAfterSend}>
                    Nästa meddelande
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
                      ? "Skriv ditt svar… (AI-utkast laddas automatiskt)"
                      : "Skriv ett svar…"
                  }
                  className={cn(
                    "min-h-[88px] resize-none rounded-xl border-border/70 bg-background/80 text-sm leading-relaxed shadow-inner",
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
                    AI-utkast
                  </Button>
                  <ReplyTemplatePicker
                    onInsert={onReplyDraftChange}
                    recipientName={message.from.name}
                    disabled={sendBusy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto h-8 gap-1.5 glow-sm"
                    onClick={onSendReply}
                    disabled={sendBusy || !replyDraft.trim()}
                  >
                    {sendBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Skicka svar
                  </Button>
                  <span className="hidden w-full text-[10px] text-muted-foreground sm:inline sm:w-auto sm:ml-0">
                    Ctrl+Enter
                    {replyDraft.trim() ? ` · ${replyDraft.trim().length} tecken` : null}
                  </span>
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
    <div className="message-reading-pane flex h-full min-h-[320px] flex-col items-center justify-center gap-6 px-6 text-center">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 shadow-sm"
      >
        <div className="hidden h-24 w-16 rounded-lg border border-border/50 bg-muted/30 sm:block" aria-hidden />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <Mail className="h-7 w-7 text-primary/70" />
        </div>
        <div className="hidden h-24 w-28 rounded-lg border border-border/50 bg-muted/20 sm:block" aria-hidden />
      </m.div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">Välj ett meddelande</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Inkorgen stannar kvar till vänster — läs, svara och markera hanterade utan att tappa kontexten.
        </p>
      </div>
      <div className="hidden rounded-xl border border-border/60 bg-muted/20 px-5 py-3 text-left md:block">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Genvägar</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">J</kbd> /{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">K</kbd> nästa / föregående
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">H</kbd> Handled
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Shift</kbd>+<kbd className="rounded border border-border px-1 font-mono text-[10px]">J</kbd>/<kbd className="rounded border border-border px-1 font-mono text-[10px]">K</kbd> hoppa mellan öppna
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">R</kbd> Reply
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">N</kbd> Next open
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Q</kbd>/<kbd className="rounded border border-border px-1 font-mono text-[10px]">O</kbd>/<kbd className="rounded border border-border px-1 font-mono text-[10px]">A</kbd>/<kbd className="rounded border border-border px-1 font-mono text-[10px]">H</kbd> filter
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">[</kbd> / <kbd className="rounded border border-border px-1 font-mono text-[10px]">]</kbd> byt kanal
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">/</kbd> fokus sök
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Esc</kbd> stäng
          </li>
        </ul>
      </div>
    </div>
  );
}
