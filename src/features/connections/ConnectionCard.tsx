import { useMemo } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";
import { Info, Link2, Loader2, Play, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionCatalogEntry } from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";
import { ConnectionHealthBadge } from "./ConnectionHealthBadge";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { aggregateStatus } from "./connectionStatus";
import { buildConnectUrl } from "./zernioClient";
import { getConnectConfig } from "./connectAuthPath";

interface Props {
  entry: ConnectionCatalogEntry;
  activeConnections: Connection[];
  businessProfileId: string;
  onDisconnect: (connectionId: string) => void;
  isDisconnecting: boolean;
  onResume?: (connectionId: string) => void;
  isResuming?: boolean;
  onViewDetails?: (connection: Connection) => void;
}

/**
 * Single integration card: shows catalog info, linked accounts, health,
 * last sync, and Connect / Reconnect / Disconnect / Resume / Details actions.
 *
 * All auth-bearing actions go through `buildConnectUrl` → server `/api/auth/*`
 * → Zernio (or native OAuth fallback). The card never talks to a provider
 * directly.
 */
export function ConnectionCard({
  entry,
  activeConnections,
  businessProfileId,
  onDisconnect,
  isDisconnecting,
  onResume,
  isResuming,
  onViewDetails,
}: Props) {
  // Include paused rows here — the card needs to render them so the user
  // can resume. The aggregate status derivation handles them correctly.
  const rows = useMemo(
    () => activeConnections.filter((c) => c.platform === entry.platform),
    [activeConnections, entry.platform]
  );
  const active = useMemo(() => rows.filter((c) => !c.disconnectedAt), [rows]);

  const connectConfig = getConnectConfig(entry.platform);
  const status = useMemo(() => aggregateStatus(rows), [rows]);
  const reconnectNeeded = status === "reconnect_required";

  function startConnect() {
    if (!connectConfig) return;
    window.location.href = buildConnectUrl(connectConfig.authPath, businessProfileId, {
      provider: connectConfig.provider,
    });
  }

  const lastSync = useMemo(() => {
    const dates = active
      .map((c) => c.lastSyncedAt)
      .filter((d): d is string => Boolean(d));
    if (dates.length === 0) return null;
    const latest = dates.reduce((a, b) => (a > b ? a : b));
    return formatRelativeTime(latest);
  }, [active]);

  const firstError = useMemo(
    () => active.find((c) => c.lastSyncError)?.lastSyncError ?? null,
    [active]
  );

  const primaryLabel = active.length === 0 ? "Connect" : reconnectNeeded ? "Reconnect" : "Add / reconnect";
  const PrimaryIcon = active.length === 0 ? Link2 : RefreshCw;

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {entry.label}
            </CardTitle>
            <CardDescription className="text-xs">{entry.connectSteps}</CardDescription>
          </div>
          <ConnectionStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.length > 0 ? (
          <ul className="space-y-1.5">
            {rows.map((c) => {
              const paused = Boolean(c.disconnectedAt);
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {c.displayName || c.username}
                      <span className="text-muted-foreground font-normal"> · @{c.username}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {paused ? "Paused" : "Connected"}{" "}
                      {(() => {
                        const ref = paused ? c.disconnectedAt : c.connectedAt;
                        if (!ref) return "";
                        return formatRelativeTime(ref) ?? ref.slice(0, 10);
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ConnectionHealthBadge health={c.health} />
                    {onViewDetails ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onViewDetails(c)}
                        aria-label={`View details for ${c.displayName || c.username}`}
                      >
                        <Info className="h-3 w-3" />
                      </Button>
                    ) : null}
                    {paused && onResume ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onResume(c.id)}
                        disabled={isResuming}
                        aria-label={`Resume ${c.displayName || c.username}`}
                      >
                        {isResuming ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                    ) : null}
                    {!paused ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onDisconnect(c.id)}
                        disabled={isDisconnecting}
                        aria-label={`Disconnect ${c.displayName || c.username}`}
                      >
                        {isDisconnecting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Unplug className="h-3 w-3" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Not connected for this business profile yet.</p>
        )}

        {firstError ? (
          <p className="text-[11px] text-destructive break-words">{firstError}</p>
        ) : null}

        {lastSync ? (
          <p className="text-[11px] text-muted-foreground">Last sync {lastSync}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {connectConfig ? (
            <Button
              type="button"
              size="sm"
              variant={active.length === 0 || reconnectNeeded ? "default" : "outline"}
              className="gap-1.5"
              onClick={startConnect}
            >
              <PrimaryIcon className="h-3.5 w-3.5" />
              {primaryLabel}
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">
              Manual setup — see {entry.pageName}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
