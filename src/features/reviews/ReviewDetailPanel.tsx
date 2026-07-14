import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { m } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ReplyTemplatePicker } from "@/features/reply-templates";
import { useKeyboardInset, useStackedWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatFullDateTime } from "@/lib/format";
import type { ReviewItem } from "./types";

export type ReviewDetailPanelProps = {
  review: ReviewItem;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  draftBusy: boolean;
  sendBusy: boolean;
  replySent: boolean;
  isReplied: boolean;
  onDraftReply: () => void;
  onSendReply: () => void;
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

const formatFullDate = formatFullDateTime;

function Stars({ rating }: { rating?: number }) {
  if (rating == null) return <span className="text-sm text-muted-foreground">Inget betyg</span>;
  return (
    <span className="inline-flex items-center gap-1 text-amber-500">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i < rating ? "fill-current" : "fill-none opacity-30")}
          aria-hidden
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground tabular-nums">{rating}/5</span>
    </span>
  );
}

export function ReviewDetailPanel({
  review,
  replyDraft,
  onReplyDraftChange,
  draftBusy,
  sendBusy,
  replySent,
  isReplied,
  onDraftReply,
  onSendReply,
  onNextAfterSend,
  onBack,
  showBack,
  navigation,
}: ReviewDetailPanelProps) {
  const isStackedWorkspace = useStackedWorkspace();
  const keyboardInset = useKeyboardInset();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const userOpenedComposeRef = useRef(false);
  const hasDraft = Boolean(replyDraft.trim());
  const author = review.author || "Anonym";

  useEffect(() => {
    userOpenedComposeRef.current = false;
    setComposeOpen(false);
  }, [review.id]);

  useEffect(() => {
    if (isStackedWorkspace) return;
    if (isReplied || replySent || draftBusy) return;
    const timer = window.setTimeout(() => replyRef.current?.focus(), 140);
    return () => window.clearTimeout(timer);
  }, [review.id, draftBusy, isReplied, replySent, isStackedWorkspace]);

  useEffect(() => {
    if (!isStackedWorkspace || !composeOpen || replySent || isReplied) return;
    if (!userOpenedComposeRef.current) return;
    const timer = window.setTimeout(() => replyRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [composeOpen, isStackedWorkspace, review.id, replySent, isReplied]);

  function openCompose() {
    userOpenedComposeRef.current = true;
    setComposeOpen(true);
  }

  const canReply = !isReplied;

  if (isStackedWorkspace) {
    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col bg-background"
        style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      >
        <header
          className={cn(
            "shrink-0 border-b border-border/70 bg-background/95 backdrop-blur-md",
            composeOpen ? "px-2 py-1.5" : "px-3 pb-3 pt-2"
          )}
        >
          <div className="flex items-center gap-1">
            {showBack && onBack ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("shrink-0 font-medium", composeOpen ? "h-9 px-2 text-sm" : "h-10 gap-1.5 px-2 text-sm")}
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4" />
                {composeOpen ? <span className="sr-only">Lista</span> : <span>Lista</span>}
              </Button>
            ) : null}

            {composeOpen ? (
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-sm font-semibold leading-tight">{author}</p>
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}

            <div className="flex shrink-0 items-center gap-0.5">
              {navigation && !composeOpen ? (
                <div className="mr-1 flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/30 p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0"
                    disabled={!navigation.hasPrev}
                    onClick={navigation.onPrev}
                    aria-label="Previous review"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="min-w-[3.5rem] px-1 text-center text-xs tabular-nums text-muted-foreground">
                    {navigation.index + 1}/{navigation.total}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0"
                    disabled={!navigation.hasNext}
                    onClick={navigation.onNext}
                    aria-label="Next review"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              ) : null}
              {review.url && !composeOpen ? (
                <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0" asChild>
                  <a href={review.url} target="_blank" rel="noreferrer" aria-label="Open review externally">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              {isReplied ? (
                <Badge variant="outline" className="h-8 gap-1 border-emerald-500/40 px-2 text-[10px] uppercase text-emerald-600">
                  <Send className="h-3 w-3" />
                  Besvarad
                </Badge>
              ) : null}
            </div>
          </div>

          {!composeOpen ? (
            <div className="mt-3 space-y-2 px-1">
              <h2 className="text-lg font-semibold leading-snug tracking-tight break-words">{author}</h2>
              <div className="flex flex-wrap items-center gap-3">
                <Stars rating={review.rating} />
                {review.createdAt ? (
                  <span className="text-xs text-muted-foreground">{formatFullDate(review.createdAt)}</span>
                ) : null}
                {review.source ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {review.source}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}
        </header>

        <div
          className={cn(
            "message-scroll min-h-0 flex-1 overflow-y-auto px-3",
            composeOpen ? "py-2" : "py-4"
          )}
        >
          <div className="message-reading-card px-4 py-4">
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-foreground",
                composeOpen ? "text-[13px] leading-snug" : "text-[15px] leading-relaxed"
              )}
            >
              {review.text || "Ingen recensionstext."}
            </p>
          </div>
        </div>

        {canReply ? (
          <footer
            className={cn(
              "shrink-0 border-t border-border/80 bg-background/95 backdrop-blur-md",
              composeOpen || replySent ? "message-compose-footer px-3 py-2" : "message-compose-footer-dock px-3 py-2"
            )}
          >
            {replySent ? (
              <div className="flex flex-col gap-2">
                <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                  <Send className="h-4 w-4" />
                  Svar skickat
                </p>
                {onNextAfterSend ? (
                  <Button type="button" variant="secondary" className="h-11 w-full text-sm" onClick={onNextAfterSend}>
                    Nästa recension
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ) : composeOpen ? (
              <div className="space-y-1.5">
                <Textarea
                  ref={replyRef}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  placeholder="Skriv ditt svar…"
                  className="min-h-[64px] max-h-[22vh] resize-y rounded-xl border-border/70 bg-muted/20 px-3 py-2 text-[13px] leading-snug shadow-none focus-visible:ring-primary/30"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && replyDraft.trim() && !sendBusy) {
                      e.preventDefault();
                      onSendReply();
                    }
                  }}
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 px-2.5 text-xs"
                    onClick={onDraftReply}
                    disabled={draftBusy}
                  >
                    {draftBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">AI</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                        aria-label="Fler"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Fler</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      <div
                        className="px-1 py-1"
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <ReplyTemplatePicker
                          className="h-9 w-full justify-start px-2.5 text-xs [&_svg]:mr-1"
                          onInsert={(text) => {
                            onReplyDraftChange(text);
                            openCompose();
                          }}
                          recipientName={review.author}
                          disabled={sendBusy}
                        />
                      </div>
                      <DropdownMenuItem onSelect={() => setComposeOpen(false)}>
                        Dölj
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    className="ml-auto h-9 gap-1.5 px-3 text-xs font-semibold"
                    onClick={onSendReply}
                    disabled={sendBusy || !replyDraft.trim()}
                  >
                    {sendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Skicka
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openCompose}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3.5 text-left text-sm transition-colors",
                    hasDraft
                      ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/45"
                  )}
                >
                  {hasDraft ? (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">Utkast klart — granska</span>
                    </>
                  ) : (
                    <span>Svara…</span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-2xl"
                  onClick={() => {
                    openCompose();
                    if (!hasDraft) onDraftReply();
                  }}
                  disabled={draftBusy}
                  aria-label="Skapa AI-utkast"
                >
                  {draftBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                </Button>
              </div>
            )}
          </footer>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-background px-4 py-4 sm:px-5">
        <div className="flex items-start gap-2">
          {showBack && onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-0.5 h-8 w-8 shrink-0 p-0 lg:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Tillbaka till listan</span>
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold leading-snug tracking-tight break-words">{author}</h2>
              <div className="flex shrink-0 items-center gap-1">
                {navigation ? (
                  <div className="mr-1 flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/30 p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!navigation.hasPrev}
                      onClick={navigation.onPrev}
                      aria-label="Previous review"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[3.5rem] px-1 text-center text-[10px] tabular-nums text-muted-foreground">
                      {navigation.index + 1}/{navigation.total}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!navigation.hasNext}
                      onClick={navigation.onNext}
                      aria-label="Next review"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {review.url ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={review.url} target="_blank" rel="noreferrer" aria-label="Open review externally">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                {isReplied ? (
                  <Badge variant="outline" className="h-8 gap-1 border-emerald-500/40 px-2 text-[10px] uppercase text-emerald-600">
                    <Send className="h-3 w-3" />
                    Replied
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Stars rating={review.rating} />
              {review.createdAt ? (
                <span className="text-xs text-muted-foreground">{formatFullDate(review.createdAt)}</span>
              ) : null}
              {review.source ? (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {review.source}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="w-full">
          <div className="message-reading-card px-4 py-4 sm:px-5 sm:py-5">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
              {review.text || "Ingen recensionstext."}
            </p>
          </div>
        </div>
      </div>

      {!isReplied ? (
        <footer className="shrink-0 border-t border-border bg-card/90 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md sm:px-5">
          {replySent ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                <Send className="h-4 w-4" />
                Reply posted
              </p>
              {onNextAfterSend ? (
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onNextAfterSend}>
                  Next review
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                ref={replyRef}
                value={replyDraft}
                onChange={(e) => onReplyDraftChange(e.target.value)}
                placeholder="Skriv ett svar, eller generera ett med AI…"
                className="min-h-[88px] resize-none border-border/80 bg-background text-sm leading-relaxed focus-visible:ring-primary/30"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && replyDraft.trim() && !sendBusy) {
                    e.preventDefault();
                    onSendReply();
                  }
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onDraftReply} disabled={draftBusy}>
                  {draftBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  AI-utkast
                </Button>
                <ReplyTemplatePicker
                  onInsert={onReplyDraftChange}
                  recipientName={review.author}
                  disabled={sendBusy}
                />
                <Button
                  type="button"
                  size="sm"
                  className="ml-auto"
                  onClick={onSendReply}
                  disabled={sendBusy || !replyDraft.trim()}
                >
                  {sendBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Skicka svar
                </Button>
              </div>
              <p className="hidden text-[11px] text-muted-foreground lg:block">Tips: Ctrl+Enter för att skicka</p>
            </div>
          )}
        </footer>
      ) : null}
    </div>
  );
}

export function ReviewDetailPlaceholder() {
  return (
    <div className="message-reading-pane flex h-full min-h-[320px] flex-col items-center justify-center gap-5 px-6 text-center">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 shadow-sm"
      >
        <div className="hidden h-20 w-14 rounded-lg border border-border/50 bg-muted/30 sm:block" aria-hidden />
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <Star className="h-6 w-6 text-primary/70" />
        </div>
        <div className="hidden h-20 w-24 rounded-lg border border-border/50 bg-muted/20 sm:block" aria-hidden />
      </m.div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">Välj en recension</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tryck en recension i listan för att läsa och svara.
        </p>
      </div>
    </div>
  );
}
