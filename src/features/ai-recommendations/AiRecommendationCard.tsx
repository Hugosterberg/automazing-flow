import { formatRelativeTime } from "@/lib/relativeTime";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AI_REC_KIND_LABELS,
  type AiRecommendationKind,
  type AiRecommendationRow,
} from "./aiRecommendationsService";

interface Props {
  rec: AiRecommendationRow;
  onAccept?: (id: string) => void;
  onDismiss?: (id: string) => void;
  isBusy?: boolean;
}

const KIND_STYLES: Record<AiRecommendationKind, string> = {
  content: "border-purple-400/40 text-purple-500 dark:text-purple-300",
  outreach: "border-info/40 text-info",
  engagement: "border-success/40 text-success",
  maintenance: "border-warning/40 text-warning",
  insight: "border-border text-muted-foreground",
};

function formatConfidence(raw: unknown): string | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n * 100)}%`;
}

function safeRelative(iso: string | null): string | null {
  if (!iso) return null;
  return formatRelativeTime(iso) ?? iso.slice(0, 19);
}

/**
 * Card view of a single recommendation. Presentational — the parent owns the
 * mutation wiring and can hide actions for resolved states (accepted /
 * dismissed) by passing no callbacks.
 */
export function AiRecommendationCard({
  rec,
  onAccept,
  onDismiss,
  isBusy,
}: Props) {
  const resolved = rec.status === "accepted" || rec.status === "dismissed";
  const createdAgo = safeRelative(rec.created_at);
  const confidence = formatConfidence(rec.confidence);

  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-card p-4 space-y-3",
        resolved && "opacity-75"
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[11px] uppercase", KIND_STYLES[rec.kind])}
            >
              {AI_REC_KIND_LABELS[rec.kind]}
            </Badge>
            {confidence ? (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {confidence} confidence
              </span>
            ) : null}
            {rec.status === "accepted" ? (
              <Badge className="text-[11px] bg-success/15 text-success border-success/40">
                Accepted
              </Badge>
            ) : null}
            {rec.status === "dismissed" ? (
              <Badge
                variant="outline"
                className="text-[11px] border-border text-muted-foreground"
              >
                Dismissed
              </Badge>
            ) : null}
          </div>
          <h3 className="text-sm font-semibold break-words">{rec.title}</h3>
        </div>
      </header>

      {rec.summary ? (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {rec.summary}
        </p>
      ) : null}

      {rec.rationale ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
            Why this suggestion?
          </summary>
          <p className="mt-1.5 text-muted-foreground whitespace-pre-wrap break-words">
            {rec.rationale}
          </p>
        </details>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {createdAgo ? `Created ${createdAgo}` : null}
        </span>
        {!resolved && (onAccept || onDismiss) ? (
          <div className="flex items-center gap-1.5">
            {onDismiss ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => onDismiss(rec.id)}
                disabled={isBusy}
              >
                {isBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                Dismiss
              </Button>
            ) : null}
            {onAccept ? (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => onAccept(rec.id)}
                disabled={isBusy}
              >
                {isBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Accept
              </Button>
            ) : null}
          </div>
        ) : null}
      </footer>
    </article>
  );
}
