import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { useConnections } from "./useConnections";
import { computeSyncFreshness, formatAgoSv } from "./syncFreshness";

/** How many stale connections one click on "Synka om" will resync. */
const MAX_RESYNC_BATCH = 5;

/**
 * One quiet line under the Today heading answering "how fresh is what I'm
 * looking at?" — most recent sync time across the tenant's connections, a
 * stale-count when something hasn't synced in 24 h, and a one-click resync
 * for the stale ones. Hides itself when there are no connections.
 */
export function SyncFreshnessStrip({
  businessProfileId,
}: {
  businessProfileId: string | null;
}) {
  const { connections, resync } = useConnections(businessProfileId);
  const [resyncing, setResyncing] = useState(false);

  const freshness = useMemo(() => computeSyncFreshness(connections), [connections]);

  if (freshness.total === 0) return null;

  async function resyncStale() {
    if (resyncing) return;
    setResyncing(true);
    const targets = freshness.stale.slice(0, MAX_RESYNC_BATCH);
    let ok = 0;
    let failed = 0;
    // Sequential on purpose: parallel resyncs hammer provider rate limits.
    for (const connection of targets) {
      try {
        await resync(connection.id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setResyncing(false);
    if (failed === 0) {
      toast.success(`${ok} koppling${ok === 1 ? "" : "ar"} omsynkade.`);
    } else {
      toast.warning(
        `${ok} omsynkade, ${failed} misslyckades — se Kopplingar för detaljer.`
      );
    }
  }

  const staleCount = freshness.stale.length;
  const staleNames = freshness.stale
    .slice(0, 2)
    .map((c) => platformLabel(c.platform))
    .join(", ");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <RefreshCw className="h-3 w-3" aria-hidden />
        {freshness.latestSyncedAt
          ? `Data uppdaterad ${formatAgoSv(freshness.latestSyncedAt)}`
          : "Ingen synk registrerad än"}
      </span>
      {staleCount > 0 ? (
        <>
          <span className="text-warning">
            {staleCount} koppling{staleCount === 1 ? "" : "ar"} äldre än 24 h
            {staleNames ? ` (${staleNames}${staleCount > 2 ? "…" : ""})` : ""}
          </span>
          <button
            type="button"
            onClick={() => void resyncStale()}
            disabled={resyncing}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5",
              "hover:text-foreground hover:border-muted-foreground/60 transition-colors",
              resyncing && "opacity-60"
            )}
          >
            <RefreshCw className={cn("h-3 w-3", resyncing && "animate-spin")} aria-hidden />
            {resyncing ? "Synkar…" : "Synka om"}
          </button>
        </>
      ) : null}
      <Link
        to="/connections?tab=health"
        className="underline-offset-2 hover:underline hover:text-foreground"
      >
        Kopplingar
      </Link>
    </div>
  );
}
