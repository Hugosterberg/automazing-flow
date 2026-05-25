import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, PlugZap, RefreshCw, Search, Unplug, X } from "lucide-react";
import { connectionsToCsv, downloadCsv } from "@/lib/exportCsv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useTokenExpiryNotifier } from "@/hooks/useTokenExpiryNotifier";
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
import { Skeleton } from "@/components/ui/skeleton";
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
    resync,
    isResyncing,
    resyncingId,
  } = useConnections(businessProfileId);

  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  useTokenExpiryNotifier(connections);

  const [reconcileState, setReconcileState] = useState<{
    loading: boolean;
    error?: string;
    updated?: number;
  }>({ loading: false });

  const [statusFilter, setStatusFilter] = useState<ConnectionStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDisconnecting, setIsBulkDisconnecting] = useState(false);

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
    setSearchQuery("");
    setSelectedIds(new Set());
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

  async function handleBulkDisconnect() {
    if (selectedIds.size === 0) return;
    setIsBulkDisconnecting(true);
    try {
      await Promise.all([...selectedIds].map((id) => disconnect(id)));
      setSelectedIds(new Set());
    } finally {
      setIsBulkDisconnecting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  async function handleDrawerResync(connection: Connection) {
    try {
      await resync(connection.id);
      void refetch();
    } catch {
      // Surface via React Query error state
    }
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

  const activeCount = connections.length;
  const effectiveFilter = statusFilter === "all" ? null : statusFilter;

  const summary = isLoading
    ? "Loading connections…"
    : `${activeCount} connected`;

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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                const csv = connectionsToCsv(connections);
                downloadCsv(csv, `anslutningar-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
              disabled={connections.length === 0}
              title="Exportera till CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Exportera
            </Button>
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
              Kontrollera
            </Button>
          </div>
        }
      />

      {oauthErrorDetails ? (
        <OAuthErrorAlert
          details={oauthErrorDetails}
          message={formatOAuthErrorMessage(oauthErrorDetails)}
          onDismiss={clearOauthError}
        />
      ) : null}

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            <strong>{selectedIds.size}</strong> vald{selectedIds.size > 1 ? "a" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Avmarkera
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleBulkDisconnect()}
              disabled={isBulkDisconnecting}
              className="h-7 text-xs"
            >
              {isBulkDisconnecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Unplug className="h-3 w-3 mr-1" />
              )}
              Koppla ifrån
            </Button>
          </div>
        </div>
      )}

      <PageToolbar trailing={summary}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Sök plattform eller konto…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 w-[220px] text-xs"
          />
        </div>
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
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-36 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ConnectionsGrid
          businessProfileId={businessProfileId}
          connections={connections}
          onDisconnect={(id) => void disconnect(id)}
          isDisconnecting={isDisconnecting}
          onResync={(id) => void resync(id)}
          isResyncing={isResyncing}
          resyncingId={resyncingId}
          onViewDetails={(c) => setDetailsId(c.id)}
          statusFilter={effectiveFilter}
          searchQuery={searchQuery}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
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
        isDisconnecting={isDisconnecting}
      />
    </div>
  );
}
