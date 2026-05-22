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
  onRemove?: (connectionId: string) => void;
  isRemoving?: boolean;
  onResync?: (connectionId: string) => void;
  isResyncing?: boolean;
  resyncingId?: string;
  onViewDetails?: (connection: Connection) => void;
  /** When set, only catalog entries whose aggregate status matches are rendered. */
  statusFilter?: ConnectionStatus | null;
  searchQuery?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
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
  onRemove,
  isRemoving,
  onResync,
  isResyncing,
  resyncingId,
  onViewDetails,
  statusFilter,
  searchQuery = "",
  selectedIds,
  onToggleSelect,
}: Props) {
  const byArea = getCatalogByArea();
  const query = searchQuery.trim().toLowerCase();

  return (
    <div className="space-y-8">
      {AREA_ORDER.map((area) => {
        const entries = byArea[area];
        if (!entries.length) return null;

        let visible = statusFilter
          ? entries.filter((e) => {
              const rows = connections.filter((c) => c.platform === e.platform);
              return aggregateStatus(rows) === statusFilter;
            })
          : entries;

        // Search: match on platform label or connected account usernames
        if (query) {
          visible = visible.filter((e) => {
            if (e.label.toLowerCase().includes(query)) return true;
            if (e.platform.toLowerCase().includes(query)) return true;
            const rows = connections.filter((c) => c.platform === e.platform);
            return rows.some(
              (c) =>
                c.username.toLowerCase().includes(query) ||
                (c.displayName ?? "").toLowerCase().includes(query)
            );
          });
        }

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
                  onRemove={onRemove}
                  isRemoving={isRemoving}
                  onResync={onResync}
                  isResyncing={isResyncing}
                  resyncingId={resyncingId}
                  onViewDetails={onViewDetails}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
