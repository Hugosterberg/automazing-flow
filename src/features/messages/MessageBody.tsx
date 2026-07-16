import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CollapsibleMailBody } from "./CollapsibleMailBody";
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
    <div className={cn("space-y-2.5 text-left lg:space-y-2", quoted && "text-muted-foreground/80")}>
      {paragraphs.map((paragraph, pi) => {
        const segments = segmentLinks(paragraph);
        return (
          <p
            key={pi}
            className={cn(
              "text-[15px] leading-[1.55] text-left sm:text-[14.5px] sm:leading-[1.5] lg:text-[14px] lg:leading-[1.5]",
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
 * Renders message body with dense mail typography, linkified URLs,
 * collapsible quoted history, and a height clamp for long emails.
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
          <CollapsibleMailBody contentKey={message.id}>
            <MessageHtmlBody html={raw} />
          </CollapsibleMailBody>
        </article>
      );
    }

    const { main, quoted } = splitEmailBody(raw);
    return (
      <article className="message-prose w-full text-left">
        <CollapsibleMailBody contentKey={message.id}>
          <div className="message-reading-card px-3.5 py-3 sm:px-4 sm:py-3.5 lg:px-4 lg:py-3.5">
            <FormattedBlock text={main || raw} />
          </div>
        </CollapsibleMailBody>
        {quoted ? (
          <div className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-muted/20 sm:rounded-lg">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-between rounded-none px-3 text-xs text-muted-foreground sm:h-7 sm:rounded-lg sm:px-2.5 sm:text-[11px]"
              onClick={() => setShowQuoted((v) => !v)}
              aria-expanded={showQuoted}
            >
              {showQuoted ? "Dölj citerat" : "Visa citerat"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showQuoted && "rotate-180")} />
            </Button>
            {showQuoted ? (
              <div className="border-t border-border/60 px-3 py-2 sm:px-3.5">
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
      <CollapsibleMailBody contentKey={message.id}>
        <div className="message-reading-card px-3.5 py-3 sm:px-4 sm:py-3.5 lg:px-4 lg:py-3.5">
          <FormattedBlock text={raw} />
        </div>
      </CollapsibleMailBody>
    </article>
  );
}
