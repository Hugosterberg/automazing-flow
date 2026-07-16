import { useMemo, useState } from "react";
import { Copy, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActivityFeed } from "@/features/activity/useActivityFeed";
import { useLeads, isLeadOpen, isFollowUpDueToday, isFollowUpOverdue } from "@/features/leads";
import { useMarketingTrend } from "@/features/marketing/useMarketingTrend";
import { useTasks } from "@/features/tasks";
import { cn } from "@/lib/utils";
import { buildWeeklyResultsSummary } from "./buildWeeklyResultsSummary";

type Props = {
  businessProfileId: string | null | undefined;
  businessName?: string | null;
  className?: string;
};

function weekAgoIso() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Auth-only weekly recap — copy/print for sharing with co-founders.
 * Not a public URL (that needs a token decision).
 */
export function WeeklyResultsCard({ businessProfileId, businessName, className }: Props) {
  const { leads } = useLeads(businessProfileId);
  const { tasks } = useTasks(businessProfileId);
  const { trend } = useMarketingTrend();
  const { events } = useActivityFeed(businessProfileId, { limit: 80 });
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    const since = weekAgoIso();
    const nowMs = Date.now();
    const leadsWon = leads.filter((l) => l.status === "won").filter((l) => {
      const at = l.updatedAt || l.createdAt || "";
      return at >= since;
    }).length;
    const leadsNew = leads.filter((l) => (l.createdAt || "") >= since).length;
    const followUpsDue = leads.filter(
      (l) =>
        isLeadOpen(l.status) &&
        (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs))
    ).length;
    const tasksCompleted = tasks.filter(
      (t) => t.status === "done" && (t.completed_at || t.updated_at || "") >= since
    ).length;
    const successEvents = events.filter(
      (e) => e.severity === "success" && (e.occurred_at || "") >= since
    ).length;

    return buildWeeklyResultsSummary({
      businessName: businessName?.trim() || "automazing",
      leadsWon,
      leadsNew,
      followUpsDue,
      tasksCompleted,
      successEvents,
      roasCurrent: trend?.current?.roas ?? null,
      revenueThisWeek: trend?.current?.revenue ?? null,
      spendThisWeek: trend?.current?.adSpend ?? null,
    });
  }, [businessName, events, leads, tasks, trend]);

  async function copyText() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(summary.plainText);
      toast.success("Veckan kopierad — klistra in i Slack eller mejl");
    } catch {
      toast.error("Kunde inte kopiera");
    } finally {
      setBusy(false);
    }
  }

  function printCard() {
    window.print();
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card/60 px-3 py-3 sm:px-4 print:border-none print:shadow-none",
        className
      )}
      aria-label="Veckan i korthet"
      data-weekly-results
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{summary.headline}</p>
            <p className="text-xs text-muted-foreground">
              Senaste 7 dagarna — kopiera eller skriv ut för att dela (kräver inloggning hos mottagaren).
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1 print:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => void copyText()}
          >
            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
            Kopiera
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={printCard}>
            <Printer className="mr-1 h-3.5 w-3.5" aria-hidden />
            Skriv ut
          </Button>
        </div>
      </div>
      {summary.hasContent ? (
        <ul className="mt-2 space-y-1 text-xs text-foreground/90">
          {summary.lines.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Lugnt läge — bra tillfälle att planera leads eller content.
        </p>
      )}
    </section>
  );
}
