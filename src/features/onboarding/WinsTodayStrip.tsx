import { Link } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useActivityFeed } from "@/features/activity/useActivityFeed";
import { cn } from "@/lib/utils";

type Props = {
  businessProfileId: string | null | undefined;
  className?: string;
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Home strip: success events from today — "what automazing (and you) got done".
 */
export function WinsTodayStrip({ businessProfileId, className }: Props) {
  const { events, isLoading } = useActivityFeed(businessProfileId, { limit: 30 });
  const since = startOfTodayIso();

  const wins = (events ?? []).filter((e) => {
    if (e.severity !== "success") return false;
    const at = e.occurred_at ? String(e.occurred_at) : "";
    return at >= since;
  });

  if (isLoading || wins.length === 0) return null;

  const visible = wins.slice(0, 4);
  const rest = wins.length - visible.length;

  return (
    <section
      className={cn(
        "rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 sm:px-4",
        className
      )}
      aria-label="Det som blev gjort idag"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PartyPopper className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {wins.length === 1 ? "1 sak klart idag" : `${wins.length} saker klart idag`}
          </p>
        </div>
        <Link
          to="/activity"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground"
        >
          Visa aktivitet
        </Link>
      </div>
      <ul className="mt-2 space-y-1">
        {visible.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-foreground/90">{e.summary || e.event_type}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatRelativeTime(e.occurred_at) ?? ""}
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">+{rest} till i Aktivitet</p>
      ) : null}
    </section>
  );
}
