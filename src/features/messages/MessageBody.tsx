import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageHtmlBody } from "./MessageHtmlBody";
import { isHtmlEmailContent } from "./messageBodyHtml";
import { segmentLinks, splitEmailBody, splitEmailParagraphs } from "./messageBodyFormat";
import type { UnifiedMessage } from "./types";

function FormattedBlock({ text, quoted }: { text: string; quoted?: boolean }) {
  const paragraphs = splitEmailParagraphs(text);
  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4 text-left", quoted && "text-muted-foreground/80")}>
      {paragraphs.map((paragraph, pi) => {
        const segments = segmentLinks(paragraph);
        return (
          <p
            key={pi}
            className={cn(
              "text-[15px] leading-[1.65] text-left",
              quoted ? "text-muted-foreground/80" : "text-foreground"
            )}
          >
            {segments.map((seg, i) =>
              seg.type === "link" ? (
                <a
                  key={`${seg.href}-${i}`}
                  href={seg.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={seg.href}
                  className="inline-block max-w-full break-all font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  {seg.label}
                </a>
              ) : (
                <span key={i} className="break-words">
                  {seg.value}
                </span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Renders message body with mail-friendly typography: readable line height,
 * linkified URLs, and collapsible quoted reply history.
 */
export function MessageBody({ message }: { message: UnifiedMessage }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const raw = (message.body || message.snippet || "").trim();
  if (!raw) {
    return <p className="text-sm text-muted-foreground">Inget innehåll.</p>;
  }

  if (message.kind === "email") {
    if (isHtmlEmailContent(raw)) {
      return (
        <article className="message-prose w-full text-left">
          <MessageHtmlBody html={raw} />
        </article>
      );
    }

    const { main, quoted } = splitEmailBody(raw);
    return (
      <article className="message-prose w-full text-left">
        <div className="message-reading-card px-4 py-4 sm:px-5 sm:py-5">
          <FormattedBlock text={main || raw} />
        </div>
        {quoted ? (
          <div className="mt-4 rounded-lg border border-border/60 bg-muted/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-between rounded-lg px-3 text-xs text-muted-foreground"
              onClick={() => setShowQuoted((v) => !v)}
              aria-expanded={showQuoted}
            >
              {showQuoted ? "Dölj citerat" : "Visa citerat"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showQuoted && "rotate-180")} />
            </Button>
            {showQuoted ? (
              <div className="border-t border-border/60 px-4 py-3 sm:px-5">
                <FormattedBlock text={quoted} quoted />
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className="message-prose w-full text-left">
      <div className="message-reading-card px-4 py-4 sm:px-5 sm:py-5">
        <FormattedBlock text={raw} />
      </div>
    </article>
  );
}
