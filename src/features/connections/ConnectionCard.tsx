import { useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";
import { CheckSquare2, Info, Layers, Link2, Loader2, Play, RefreshCw, Square, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  onRemove?: (connectionId: string) => void;
  isRemoving?: boolean;
  onResync?: (connectionId: string) => void;
  isResyncing?: boolean;
  resyncingId?: string;
  onViewDetails?: (connection: Connection) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
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
  onRemove,
  isRemoving,
  onResync,
  isResyncing,
  resyncingId,
  onViewDetails,
  selectedIds,
  onToggleSelect,
}: Props) {
  const [removeTarget, setRemoveTarget] = useState<Connection | null>(null);
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

  function startConnect(provider?: "zernio" | "official") {
    if (!connectConfig) return;
    window.location.href = buildConnectUrl(connectConfig.authPath, businessProfileId, {
      provider: provider ?? connectConfig.provider,
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
                  {onToggleSelect && !paused && (
                    <button
                      type="button"
                      onClick={() => onToggleSelect(c.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={selectedIds?.has(c.id) ? "Avmarkera" : "Markera"}
                    >
                      {selectedIds?.has(c.id) ? (
                        <CheckSquare2 className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
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
                    {!paused && onResync ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onResync(c.id)}
                        disabled={isResyncing}
                        aria-label={`Resync ${c.displayName || c.username}`}
                        title="Kontrollera anslutningsstatus"
                      >
                        {isResyncing && resyncingId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
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
                        title="Resume this connection"
                      >
                        {isResuming ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                    ) : null}
                    {paused && onRemove ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setRemoveTarget(c)}
                        disabled={isRemoving}
                        aria-label={`Remove ${c.displayName || c.username}`}
                        title="Remove permanently so you can connect a different account"
                      >
                        {isRemoving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    ) : null}
                    {!paused ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
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
            entry.platform === "google_business" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={active.length === 0 || reconnectNeeded ? "default" : "outline"}
                  className="gap-1.5"
                  onClick={() => startConnect("official")}
                >
                  <PrimaryIcon className="h-3.5 w-3.5" />
                  Official API
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => startConnect("zernio")}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Zernio
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={active.length === 0 || reconnectNeeded ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => startConnect()}
              >
                <PrimaryIcon className="h-3.5 w-3.5" />
                {primaryLabel}
              </Button>
            )
          ) : (
            <span className="text-[11px] text-muted-foreground italic">
              Manual setup — see {entry.pageName}
            </span>
          )}
        </div>
      </CardContent>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {removeTarget?.displayName || removeTarget?.username} and clears its
              stored tokens. You can then connect a different account in its place. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeTarget && onRemove) onRemove(removeTarget.id);
                setRemoveTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
