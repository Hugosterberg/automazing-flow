import { useEffect, useMemo, useState } from "react";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageToolbar } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import {
  useConnections,
  reconcileConnections,
  useAutoReconcile,
  buildConnectUrl,
} from "@/features/connections";
import { ConnectionsGrid } from "@/features/connections/ConnectionsGrid";
import { ConnectionDetailsDrawer } from "@/features/connections/ConnectionDetailsDrawer";
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_ORDER,
  type ConnectionStatus,
} from "@/features/connections/connectionStatus";
import { getConnectConfig } from "@/features/connections/connectAuthPath";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import type { Connection } from "@/types/connection";

/**
 * /connections — Connections Center. Single surface to see every integration,
 * its health, last sync and errors. Replaces the legacy /integrations page.
 *
 * Scope:
 * - Scoped to the active business profile (via ActiveBusinessProfileProvider).
 * - Falls back to the legacy active profile id from AccountsContext when
 *   cloud auth is not enabled, so local-mode users still see something.
 */
export default function ConnectionsPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  const {
    connections,
    isLoading,
    isFetching,
    refetch,
    disconnect,
    isDisconnecting,
    resume,
    isResuming,
  } = useConnections(businessProfileId);

  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();

  const [reconcileState, setReconcileState] = useState<{
    loading: boolean;
    error?: string;
    updated?: number;
  }>({ loading: false });

  const [statusFilter, setStatusFilter] = useState<ConnectionStatus | "all">("all");

  // Details drawer wiring. We stash the id (not the object) so the drawer
  // always reads the freshest row from the query cache.
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsConnection = useMemo(
    () => connections.find((c) => c.id === detailsId) ?? null,
    [connections, detailsId]
  );

  useEffect(() => {
    setReconcileState({ loading: false });
    setStatusFilter("all");
    setDetailsId(null);
  }, [businessProfileId]);

  useAutoReconcile({
    businessProfileId,
    onDone: (result) => {
      if (result.error) {
        setReconcileState({ loading: false, error: result.error });
      } else {
        setReconcileState({ loading: false, updated: result.updated });
        void refetch();
      }
    },
  });

  async function runReconcile() {
    if (!businessProfileId) return;
    setReconcileState({ loading: true });
    try {
      const res = await reconcileConnections(businessProfileId);
      setReconcileState({ loading: false, updated: res.updated });
      await refetch();
    } catch (e) {
      setReconcileState({
        loading: false,
        error: e instanceof Error ? e.message : "Reconcile failed",
      });
    }
  }

  function startReconnect(connection: Connection) {
    if (!businessProfileId) return;
    const config = getConnectConfig(connection.platform);
    if (!config) return;
    window.location.href = buildConnectUrl(config.authPath, businessProfileId, {
      provider: config.provider,
    });
  }

  async function handleDrawerDisconnect(connection: Connection) {
    try {
      await disconnect(connection.id);
      setDetailsId(null);
    } catch {
      // Mutation error state already surfaced by React Query; no-op here.
    }
  }

  async function handleDrawerResume(connection: Connection) {
    try {
      await resume(connection.id);
    } catch {
      // See above.
    }
  }

  async function handleDrawerResync(_connection: Connection) {
    // Per-connection resync is not a dedicated server endpoint yet. For now
    // we trigger the tenant-wide reconcile, which touches all rows including
    // this one. When /api/connections/:id/resync is added, swap it here.
    await runReconcile();
  }

  if (!businessProfileId) {
    return (
      <div className="max-w-3xl mx-auto py-16">
        <EmptyState
          icon={PlugZap}
          title="No business profile selected"
          description="Pick or create a business profile from the context bar above to manage its connections."
        />
      </div>
    );
  }

  const activeCount = connections.filter((c) => !c.disconnectedAt).length;
  const pausedCount = connections.filter((c) => Boolean(c.disconnectedAt)).length;
  const effectiveFilter = statusFilter === "all" ? null : statusFilter;

  const summary = isLoading
    ? "Loading connections…"
    : `${activeCount} active, ${pausedCount} paused`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={PlugZap}
        title="Connections"
        description={
          <>
            All integrations for{" "}
            <span className="font-medium text-foreground">
              {legacy.activeProfile?.name ?? "this business profile"}
            </span>
            . Connect or disconnect accounts, see health and re-auth status.
          </>
        }
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void runReconcile()}
            disabled={reconcileState.loading || isFetching}
          >
            {reconcileState.loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Check health
          </Button>
        }
      />

      {oauthErrorDetails ? (
        <OAuthErrorAlert
          details={oauthErrorDetails}
          message={formatOAuthErrorMessage(oauthErrorDetails)}
          onDismiss={clearOauthError}
        />
      ) : null}

      <PageToolbar trailing={summary}>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ConnectionStatus | "all")}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CONNECTION_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {CONNECTION_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reconcileState.updated != null ? (
          <span className="text-[11px] text-success">
            Updated {reconcileState.updated} connection
            {reconcileState.updated === 1 ? "" : "s"}
          </span>
        ) : null}
        {reconcileState.error ? (
          <span className="text-[11px] text-destructive">
            {reconcileState.error}
          </span>
        ) : null}
      </PageToolbar>

      {isLoading ? (
        <div className="py-20 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading connections…
        </div>
      ) : (
        <ConnectionsGrid
          businessProfileId={businessProfileId}
          connections={connections}
          onDisconnect={(id) => void disconnect(id)}
          isDisconnecting={isDisconnecting}
          onResume={(id) => void resume(id)}
          isResuming={isResuming}
          onViewDetails={(c) => setDetailsId(c.id)}
          statusFilter={effectiveFilter}
        />
      )}

      <ConnectionDetailsDrawer
        connection={detailsConnection}
        open={Boolean(detailsId)}
        onOpenChange={(o) => {
          if (!o) setDetailsId(null);
        }}
        onReconnect={startReconnect}
        onResync={(c) => void handleDrawerResync(c)}
        onDisconnect={(c) => void handleDrawerDisconnect(c)}
        onResume={(c) => void handleDrawerResume(c)}
        isDisconnecting={isDisconnecting}
        isResuming={isResuming}
      />
    </div>
  );
}
