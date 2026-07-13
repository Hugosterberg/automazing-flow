import { useState } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";
import { CheckCircle2, Loader2, PlugZap, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Connection } from "@/types/connection";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { statusFromConnection } from "./connectionStatus";
import { connectionFixHint } from "./connectionFixHints";
import { CONNECTION_CATALOG } from "@/lib/connectionCatalog";
import { useSyncRuns, type SyncRunRow } from "./useSyncRuns";
import { ActivityFeed, useActivityFeed } from "@/features/activity";

interface Props {
  connection: Connection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconnect?: (connection: Connection) => void;
  onResync?: (connection: Connection) => Promise<import("./useConnections").ConnectionTestResult | void>;
  onDisconnect?: (connection: Connection) => void;
  isDisconnecting?: boolean;
}

function safeRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return formatRelativeTime(iso) ?? iso.slice(0, 19);
}

function SyncRunItem({ run }: { run: SyncRunRow }) {
  const finished = safeRelative(run.finished_at) ?? safeRelative(run.started_at);
  const icon =
    run.status === "success" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
    ) : run.status === "failed" ? (
      <XCircle className="h-3.5 w-3.5 text-destructive" />
    ) : run.status === "partial" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-warning" />
    ) : run.status === "cancelled" ? (
      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />
    );

  return (
    <li className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground capitalize">
          {icon}
          {run.kind} · {run.status}
        </span>
        {finished ? (
          <span className="text-[11px] text-muted-foreground tabular-nums">{finished}</span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        <span>{run.items_processed} items</span>
        {run.error_message ? (
          <span className="text-destructive break-words">{run.error_message}</span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Side-sheet with the full picture for a single connection: identity, timing,
 * current health/status, recent sync runs, and primary actions. Kept read-
 * mostly: mutations bubble back up to the parent page so we don't duplicate
 * React Query wiring here.
 */
export function ConnectionDetailsDrawer({
  connection,
  open,
  onOpenChange,
  onReconnect,
  onResync,
  onDisconnect,
  isDisconnecting,
}: Props) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const { runs, lastSuccessfulAt: derivedLastOk, isLoading: runsLoading } = useSyncRuns(
    connection?.id
  );
  // Recent activity events *about this connection*. Tenant-scoped by
  // business_profile_id, narrowed to subject_id = connection.id so the drawer
  // stays focused (no unrelated events for the wider tenant).
  const { events: activityEvents, isLoading: activityLoading } = useActivityFeed(
    connection?.businessProfileId,
    {
      subjectType: "connected_account",
      subjectId: connection?.id ?? null,
      limit: 15,
    }
  );
  // Prefer the denormalised value on the connection row — it's written by
  // the server after every successful sync and avoids waiting on sync_runs.
  // Falls back to the client-side derivation for rows that haven't had a
  // successful run yet (or for platforms not writing sync_runs).
  const effectiveLastOk = connection?.lastSuccessfulSyncAt ?? derivedLastOk;

  if (!connection) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg" />
      </Sheet>
    );
  }

  const status = statusFromConnection(connection);
  const catalogEntry = CONNECTION_CATALOG.find((e) => e.platform === connection.platform);
  const fixHint = connectionFixHint(connection, catalogEntry);
  const connectedAgo = safeRelative(connection.connectedAt);
  const lastSyncAgo = safeRelative(connection.lastSyncedAt);
  const lastOkAgo = safeRelative(effectiveLastOk);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base truncate">
              {connection.displayName || connection.username}
            </SheetTitle>
            <ConnectionStatusBadge status={status} />
          </div>
          <SheetDescription className="text-xs">
            {connection.integration?.name ?? connection.platform} · @{connection.username}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Identity
              </h3>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Platform</dt>
                <dd className="col-span-2 font-mono">{connection.platform}</dd>
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="col-span-2">
                  {connection.isZernio ? "Zernio" : connection.isOAuth ? "Native OAuth" : "Manual"}
                </dd>
                {connection.zernioAccountId ? (
                  <>
                    <dt className="text-muted-foreground">Zernio ID</dt>
                    <dd className="col-span-2 font-mono truncate">
                      {connection.zernioAccountId}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Kopplings-ID</dt>
                <dd className="col-span-2 font-mono truncate">{connection.id}</dd>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <ConnectionStatusBadge status={status} />
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Kopplad</dt>
                <dd className="col-span-2">{connectedAgo ?? "—"}</dd>
                <dt className="text-muted-foreground">Senaste synk</dt>
                <dd className="col-span-2">{lastSyncAgo ?? "—"}</dd>
                <dt className="text-muted-foreground">Senaste lyckade synk</dt>
                <dd className="col-span-2">{lastOkAgo ?? "—"}</dd>
                {connection.lastSyncError ? (
                  <>
                    <dt className="text-muted-foreground">Senaste fel</dt>
                    <dd className="col-span-2 text-destructive break-words">
                      {connection.lastSyncError}
                    </dd>
                  </>
                ) : null}
              </dl>
              {fixHint && connection.health !== "healthy" ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 leading-relaxed">
                  {fixHint}
                </p>
              ) : null}
            </section>

            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Senaste synkkörningar
                </h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {runs.length}
                </span>
              </div>
              {runsLoading ? (
                <p className="text-xs text-muted-foreground">Laddar körningar…</p>
              ) : runs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Inga synkkörningar registrerade för den här kopplingen ännu.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {runs.map((r) => (
                    <SyncRunItem key={r.id} run={r} />
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Senaste aktivitet
                </h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {activityEvents.length}
                </span>
              </div>
              <ActivityFeed
                events={activityEvents}
                isLoading={activityLoading}
                emptyMessage="Ingen aktivitet registrerad för den här kopplingen ännu."
                maxRows={10}
              />
            </section>
          </div>
        </ScrollArea>

        <Separator />

        <div className="px-5 py-3 flex flex-wrap gap-2">
          {onReconnect ? (
            <Button
              size="sm"
              variant={status === "reconnect_required" ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => onReconnect(connection)}
            >
              Koppla om
            </Button>
          ) : null}
          {onResync ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void onResync(connection)}
            >
              <PlugZap className="h-3.5 w-3.5" />
              Testa koppling
            </Button>
          ) : null}
          {onDisconnect ? (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 ml-auto text-destructive hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Koppla från
            </Button>
          ) : null}
        </div>
      </SheetContent>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Koppla från {connection?.displayName || connection?.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Kontot tas bort och sparade tokens rensas. Du kan koppla ett annat konto i stället.
              Detta går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (connection && onDisconnect) onDisconnect(connection);
                setRemoveOpen(false);
              }}
            >
              Koppla från
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
