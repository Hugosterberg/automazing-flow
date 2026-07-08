import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { m } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReplyTemplatePicker } from "@/features/reply-templates";
import { cn } from "@/lib/utils";
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

function formatFullDate(raw?: string): string {
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

function Stars({ rating }: { rating?: number }) {
  if (rating == null) return <span className="text-sm text-muted-foreground">No rating</span>;
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
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isReplied || replySent || draftBusy) return;
    const timer = window.setTimeout(() => replyRef.current?.focus(), 140);
    return () => window.clearTimeout(timer);
  }, [review.id, draftBusy, isReplied, replySent]);

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
              <span className="sr-only">Back to list</span>
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold leading-snug tracking-tight break-words">
                {review.author || "Anonymous"}
              </h2>
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

      <div className="min-h-0 flex-1 overflow-y-auto app-scroll px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
            {review.text || "No review text."}
          </p>
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
                placeholder="Write a reply, or generate one with AI…"
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
                  AI draft
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
                  Send reply
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Tip: Ctrl+Enter to send</p>
            </div>
          )}
        </footer>
      ) : null}
    </div>
  );
}

export function ReviewDetailPlaceholder() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 bg-gradient-to-b from-muted/20 to-background px-6 text-center">
      <m.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-dashed border-border/80 bg-card/50 p-6 shadow-sm"
      >
        <Star className="mx-auto h-9 w-9 text-muted-foreground/50" />
      </m.div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Select a review</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Pick a review from the list to read it here and compose your reply.
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
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Esc</kbd> — close review
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
