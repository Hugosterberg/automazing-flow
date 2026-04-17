import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { useAccounts } from "@/context/AccountsContext";
import {
  AREA_LABELS,
  getConnectionEntriesForArea,
  type AppArea,
} from "@/lib/connectionCatalog";
import { cn } from "@/lib/utils";

type Props = {
  area: AppArea;
  className?: string;
};

/**
 * Compact checklist for the current app page: what is linked to the active profile vs what still needs setup.
 */
export function SectionConnectionStatus({ area, className }: Props) {
  const { activeProfileId, allAccounts } = useAccounts();
  const entries = getConnectionEntriesForArea(area);

  const linked = useMemo(
    () => allAccounts.filter((a) => a.profileId === activeProfileId && !a.disconnectedAt),
    [allAccounts, activeProfileId]
  );

  const total = entries.length;
  const linkedTypeCount = useMemo(
    () => entries.filter((e) => linked.some((a) => a.platform === e.platform)).length,
    [entries, linked]
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-muted/20 px-3 py-3 sm:px-4 sm:py-3.5 space-y-2.5",
        className
      )}
      role="region"
      aria-label={`${AREA_LABELS[area]} connection status for the active profile`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {AREA_LABELS[area]} · connections
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {linkedTypeCount} of {total} integration{total === 1 ? "" : "s"} linked for this profile
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <Link to="/integrations" className="underline underline-offset-2 hover:text-foreground">
            Full map
          </Link>
          <Link to="/preferences" className="underline underline-offset-2 hover:text-foreground">
            API keys & tests
          </Link>
        </div>
      </div>
      <ul className="space-y-2">
        {entries.map((entry) => {
          const accs = linked.filter((a) => a.platform === entry.platform);
          const ok = accs.length > 0;
          return (
            <li key={entry.platform} className="flex gap-2.5 text-sm">
              {ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50 mt-0.5" aria-hidden />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                  <span className="font-medium text-foreground">{entry.label}</span>
                  {ok ? (
                    <span className="text-xs text-muted-foreground truncate">
                      {accs.map((a) => a.displayName || a.username).join(" · ")}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-500/90">Not linked for this profile</span>
                  )}
                </div>
                {!ok ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground/90">Do:</span> {entry.connectSteps}{" "}
                    <Link to={entry.pageHref} className="underline underline-offset-2 hover:text-foreground whitespace-nowrap">
                      Open {entry.pageName}
                    </Link>
                    <br />
                    <span className="text-foreground/90">Server:</span> {entry.serverNeeds}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
