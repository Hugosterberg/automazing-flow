import { AREA_LABELS, AREA_ORDER, getCatalogByArea } from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";
import { ConnectionCard } from "./ConnectionCard";
import { aggregateStatus, type ConnectionStatus } from "./connectionStatus";

interface Props {
  businessProfileId: string;
  connections: Connection[];
  onDisconnect: (connectionId: string) => void;
  isDisconnecting: boolean;
  onResume?: (connectionId: string) => void;
  isResuming?: boolean;
  onViewDetails?: (connection: Connection) => void;
  /** When set, only catalog entries whose aggregate status matches are rendered. */
  statusFilter?: ConnectionStatus | null;
}

/**
 * All integrations grouped by area. Single source of truth for what can be
 * connected. Pages elsewhere should only *read* from the resulting
 * connections, not own their own Connect flows.
 */
export function ConnectionsGrid({
  businessProfileId,
  connections,
  onDisconnect,
  isDisconnecting,
  onResume,
  isResuming,
  onViewDetails,
  statusFilter,
}: Props) {
  const byArea = getCatalogByArea();

  return (
    <div className="space-y-8">
      {AREA_ORDER.map((area) => {
        const entries = byArea[area];
        if (!entries.length) return null;

        const visible = statusFilter
          ? entries.filter((e) => {
              const rows = connections.filter((c) => c.platform === e.platform);
              return aggregateStatus(rows) === statusFilter;
            })
          : entries;

        if (!visible.length) return null;

        return (
          <section key={area} aria-labelledby={`area-${area}`} className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2
                id={`area-${area}`}
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {AREA_LABELS[area]}
              </h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {
                  entries.filter((e) =>
                    connections.some(
                      (c) => c.platform === e.platform && !c.disconnectedAt
                    )
                  ).length
                }{" "}
                / {entries.length} linked
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.map((entry) => (
                <ConnectionCard
                  key={entry.platform}
                  entry={entry}
                  activeConnections={connections}
                  businessProfileId={businessProfileId}
                  onDisconnect={onDisconnect}
                  isDisconnecting={isDisconnecting}
                  onResume={onResume}
                  isResuming={isResuming}
                  onViewDetails={onViewDetails}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
