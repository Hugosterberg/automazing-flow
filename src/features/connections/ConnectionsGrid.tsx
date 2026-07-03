import { AREA_LABELS, areaOrderForMode, getCatalogByArea, type AppArea } from "@/lib/connectionCatalog";
import { useWorkspaceMode } from "@/features/workspace-mode";
import type { AccountPlatform } from "@/types/accounts";
import type { Connection } from "@/types/connection";
import type { McpProviderReadiness } from "@/features/intelligence/intelligenceService";
import { ConnectionCard } from "./ConnectionCard";
import { aggregateStatus, type ConnectionStatus } from "./connectionStatus";

interface Props {
  businessProfileId: string;
  connections: Connection[];
  onDisconnect: (connectionId: string) => void;
  isDisconnecting: boolean;
  onResync?: (connectionId: string) => void;
  isResyncing?: boolean;
  resyncingId?: string;
  onViewDetails?: (connection: Connection) => void;
  /** When set, only catalog entries whose aggregate status matches are rendered. */
  statusFilter?: ConnectionStatus | null;
  searchQuery?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  manuallyConnectedPlatforms?: Set<AccountPlatform>;
  onManualConnectionChange?: (platform: AccountPlatform, connected: boolean) => void;
  mcpReadinessByPlatform?: Map<string, McpProviderReadiness>;
  /** When set, only render these catalog areas (e.g. intelligence MCP tab). */
  areasFilter?: AppArea[];
  /** When set, hide these catalog areas (e.g. intelligence on integrations tab). */
  areasExclude?: AppArea[];
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
  onResync,
  isResyncing,
  resyncingId,
  onViewDetails,
  statusFilter,
  searchQuery = "",
  selectedIds,
  onToggleSelect,
  manuallyConnectedPlatforms = new Set<AccountPlatform>(),
  onManualConnectionChange,
  mcpReadinessByPlatform,
  areasFilter,
  areasExclude,
}: Props) {
  const { mode } = useWorkspaceMode();
  const byArea = getCatalogByArea();
  const areaOrder = areaOrderForMode(mode).filter((area) => {
    if (areasFilter?.length && !areasFilter.includes(area)) return false;
    if (areasExclude?.includes(area)) return false;
    return true;
  });
  const query = searchQuery.trim().toLowerCase();

  function entryStatus(platform: AccountPlatform): ConnectionStatus {
    const rows = connections.filter((c) => c.platform === platform);
    if (rows.length > 0) return aggregateStatus(rows);
    if (manuallyConnectedPlatforms.has(platform)) return "connected";
    return "not_connected";
  }

  function entryIsLinked(platform: AccountPlatform): boolean {
    return manuallyConnectedPlatforms.has(platform) || connections.some((c) => c.platform === platform);
  }

  return (
    <div className="space-y-8">
      {areaOrder.map((area) => {
        const entries = byArea[area];
        if (!entries.length) return null;

        let visible = statusFilter
          ? entries.filter((e) => entryStatus(e.platform) === statusFilter)
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
                  entries.filter((e) => entryIsLinked(e.platform)).length
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
                  mcpReadiness={mcpReadinessByPlatform?.get(entry.platform) ?? null}
                  onDisconnect={onDisconnect}
                  isDisconnecting={isDisconnecting}
                  onResync={onResync}
                  isResyncing={isResyncing}
                  resyncingId={resyncingId}
                  onViewDetails={onViewDetails}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  manuallyConnected={
                    manuallyConnectedPlatforms.has(entry.platform) &&
                    !connections.some((connection) => connection.platform === entry.platform)
                  }
                  onManualConnectionChange={onManualConnectionChange}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
