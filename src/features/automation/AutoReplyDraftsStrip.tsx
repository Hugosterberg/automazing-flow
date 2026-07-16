import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/relativeTime";
import { isDemoId, useDemoMode } from "@/features/demo";
import { sendAutomationDraft, type AutoReplyLogEntry } from "./automationService";
import { useInvalidatePendingDmDrafts, usePendingDmDrafts } from "./usePendingDmDrafts";

type Props = {
  businessProfileId: string | null | undefined;
  className?: string;
  /** Compact single-row variant for embedding above the inbox. */
  compact?: boolean;
};

/**
 * Surfaces pending DM auto-reply drafts where work happens (Messages),
 * so draft-before-send does not require opening Automations first.
 */
export function AutoReplyDraftsStrip({ businessProfileId, className, compact }: Props) {
  const { drafts, isLoading } = usePendingDmDrafts(businessProfileId);
  const { dismissDmDraft } = useDemoMode();
  const invalidate = useInvalidatePendingDmDrafts();
  const [sendingId, setSendingId] = useState<string | null>(null);

  if (!businessProfileId || isLoading || drafts.length === 0) return null;

  async function handleSend(entry: AutoReplyLogEntry) {
    if (!businessProfileId) return;
    setSendingId(entry.id);
    try {
      if (isDemoId(entry.id)) {
        dismissDmDraft(entry.id);
        toast.success("Demo — inget skickades på riktigt");
        return;
      }
      await sendAutomationDraft(businessProfileId, entry.id);
      toast.success("Svaret skickades");
      invalidate(businessProfileId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skicka utkastet.");
    } finally {
      setSendingId(null);
    }
  }

  const visible = drafts.slice(0, compact ? 3 : 5);
  const rest = drafts.length - visible.length;

  return (
    <section
      className={cn(
        "rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 sm:px-4",
        className
      )}
      aria-label="AI-utkast att granska"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {drafts.length === 1 ? "1 AI-utkast väntar" : `${drafts.length} AI-utkast väntar`}
            </p>
            <p className="text-xs text-muted-foreground">
              Auto-svar i utkastläge — granska och skicka, eller öppna Automationer.
            </p>
          </div>
        </div>
        <Button asChild type="button" size="sm" variant="ghost" className="h-7 shrink-0 text-xs">
          <Link to="/automations?tab=messages&focus=auto-reply">Automationer</Link>
        </Button>
      </div>

      <ul className="mt-2 space-y-1.5">
        {visible.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {entry.author_name || "Okänd"}
                {entry.platform ? (
                  <span className="ml-1.5 font-normal capitalize text-muted-foreground">
                    · {entry.platform}
                  </span>
                ) : null}
                {entry.created_at ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · {formatRelativeTime(entry.created_at) ?? ""}
                  </span>
                ) : null}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {entry.draft_text}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              disabled={sendingId === entry.id}
              onClick={() => void handleSend(entry)}
            >
              {sendingId === entry.id ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Skicka
            </Button>
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          +{rest} till under{" "}
          <Link to="/automations?tab=messages&focus=auto-reply" className="underline underline-offset-2">
            Automationer
          </Link>
        </p>
      ) : null}
    </section>
  );
}
