import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, ExternalLink, Globe2, Loader2, PlugZap, RefreshCw, Save, Search, Unplug, X, Bot, Activity, Building2 } from "lucide-react";
import { connectionsToCsv, downloadCsv } from "@/lib/exportCsv";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageToolbar } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  useConnections,
  reconcileConnections,
  useAutoReconcile,
  buildConnectUrl,
  ConnectionsControlPanel,
  useConnectionsHealthIssueCount,
} from "@/features/connections";
import { connectionTestToastMessage } from "@/features/connections/connectionFixHints";
import { ConnectionsGrid } from "@/features/connections/ConnectionsGrid";
import { ConnectionDetailsDrawer } from "@/features/connections/ConnectionDetailsDrawer";
import { McpProviderStatusList, McpDataCatalog, McpToolsExplorer, useMcpProvidersStatus } from "@/features/intelligence";
import { useAutomationRuns } from "@/features/automation/useAutomationRuns";
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_ORDER,
  type ConnectionStatus,
} from "@/features/connections/connectionStatus";
import { getConnectConfig } from "@/features/connections/connectAuthPath";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { getConnectionEntriesForArea } from "@/lib/connectionCatalog";
import type { AccountPlatform } from "@/types/accounts";
import type { Connection } from "@/types/connection";

type ConnectionsTab = "integrations" | "mcp" | "health";
type StatusFilterValue = ConnectionStatus | "all" | "needs_attention";

function parseConnectionsTab(value: string | null): ConnectionsTab {
  if (value === "mcp" || value === "health") return value;
  return "integrations";
}

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!parsed.hostname) throw new Error("missing_hostname");
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function safeWebsiteUrl(value: string | null | undefined): string | null {
  try {
    return value ? normalizeWebsiteUrl(value) : null;
  } catch {
    return null;
  }
}

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
  const { toast } = useToast();
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;
  const [websiteInput, setWebsiteInput] = useState(legacy.activeProfile?.website ?? "");
  const [websiteSaving, setWebsiteSaving] = useState(false);

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

  const { byPlatform: mcpReadinessByPlatform, providers: mcpProviders } = useMcpProvidersStatus(businessProfileId);
  const automationRuns = useAutomationRuns(businessProfileId);
  const healthIssueCount = useConnectionsHealthIssueCount(
    connections,
    mcpProviders,
    automationRuns
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseConnectionsTab(searchParams.get("tab"));
  const setActiveTab = useCallback(
    (tab: ConnectionsTab) => {
      setSearchParams(tab === "integrations" ? {} : { tab }, { replace: true });
    },
    [setSearchParams]
  );

  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  useTokenExpiryNotifier(connections);

  const [reconcileState, setReconcileState] = useState<{
    loading: boolean;
    error?: string;
    updated?: number;
  }>({ loading: false });

  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(() =>
    searchParams.get("filter") === "attention" ? "needs_attention" : "all"
  );
  // `?q=` lets nudges (e.g. the token-expiry toast) land with the affected
  // platform already searched for, so the fix is one click away.
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDisconnecting, setIsBulkDisconnecting] = useState(false);
  const [manuallyConnectedPlatforms, setManuallyConnectedPlatforms] = useState<Set<AccountPlatform>>(new Set());

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

  useEffect(() => {
    setWebsiteInput(legacy.activeProfile?.website ?? "");
  }, [legacy.activeProfile?.website, businessProfileId]);

  useEffect(() => {
    if (!businessProfileId) {
      setManuallyConnectedPlatforms(new Set());
      return;
    }
    let cancelled = false;
    async function loadManualConnections() {
      try {
        const res = await fetchWithTimeout(
          apiUrl(`/api/settings/secrets?business_profile_id=${encodeURIComponent(businessProfileId!)}`),
          { credentials: "include" }
        );
        const payload = await res.json().catch(() => ({}));
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        const next = new Set<AccountPlatform>();
        const canva = entries.find((item: { key?: string; configured?: boolean }) => item.key === "CANVA_ACCESS_TOKEN");
        if (canva?.configured) next.add("canva");
        if (!cancelled) setManuallyConnectedPlatforms(next);
      } catch {
        if (!cancelled) setManuallyConnectedPlatforms(new Set());
      }
    }
    void loadManualConnections();
    return () => {
      cancelled = true;
    };
  }, [businessProfileId]);

  const handleReconcileDone = useCallback(
    (result: { updated?: number; error?: string }) => {
      if (result.error) {
        setReconcileState({ loading: false, error: result.error });
      } else {
        setReconcileState({ loading: false, updated: result.updated });
        void refetch();
        window.dispatchEvent(new CustomEvent("automazing:connections-changed"));
      }
    },
    [refetch]
  );

  useAutoReconcile({
    businessProfileId,
    onDone: handleReconcileDone,
  });

  async function runReconcile() {
    if (!businessProfileId) return;
    setReconcileState({ loading: true });
    try {
      const res = await reconcileConnections(businessProfileId);
      setReconcileState({ loading: false, updated: res.updated });
      await refetch();
      window.dispatchEvent(new CustomEvent("automazing:connections-changed"));
    } catch (e) {
      setReconcileState({
        loading: false,
        error: e instanceof Error ? e.message : "Uppdatering misslyckades",
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

  function handleManualConnectionChange(platform: AccountPlatform, connected: boolean) {
    setManuallyConnectedPlatforms((current) => {
      const next = new Set(current);
      if (connected) next.add(platform);
      else next.delete(platform);
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
      const result = await resync(connection.id);
      void refetch();
      const toastMsg = connectionTestToastMessage(result);
      toast({
        title: toastMsg.title,
        description: toastMsg.description,
        variant: toastMsg.variant,
      });
    } catch (err) {
      toast({
        title: "Kopplingstest misslyckades",
        description: err instanceof Error ? err.message : "Could not test the connection.",
        variant: "destructive",
      });
    }
  }

  async function saveWebsite() {
    if (!legacy.activeProfile) return;
    let normalized: string;
    try {
      normalized = normalizeWebsiteUrl(websiteInput);
    } catch {
      toast({
        title: "Ogiltig webbadress",
        description: "Ange en giltig domän eller URL, till exempel https://example.com.",
        variant: "destructive",
      });
      return;
    }

    setWebsiteSaving(true);
    try {
      await Promise.resolve(
        legacy.updateProfile(legacy.activeProfile.id, {
          website: normalized || undefined,
        })
      );
      setWebsiteInput(normalized);
      toast({
        title: normalized ? "Webbplats sparad" : "Webbplats borttagen",
        description: normalized
          ? "Digitalt varumärke använder den här URL:en för rekommendationer."
          : "Lägg till en webbadress senare för Digitalt varumärke-rekommendationer.",
      });
    } catch (error) {
      toast({
        title: "Kunde inte spara webbadress",
        description: error instanceof Error ? error.message : "Profiluppdateringen misslyckades.",
        variant: "destructive",
      });
    } finally {
      setWebsiteSaving(false);
    }
  }

  if (!businessProfileId) {
    return (
      <div className="max-w-3xl mx-auto py-16">
        <EmptyState
          icon={PlugZap}
          title="Ingen företagsprofil vald"
          description="Välj eller skapa en företagsprofil för att hantera kopplingar."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/company">Gå till Företag</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const manualOnlyCount = [...manuallyConnectedPlatforms].filter(
    (platform) => !connections.some((connection) => connection.platform === platform)
  ).length;
  const activeCount = connections.length + manualOnlyCount;
  const effectiveFilter =
    statusFilter === "all" || statusFilter === "needs_attention" ? null : statusFilter;
  const needsAttentionOnly = statusFilter === "needs_attention";

  const summary = isLoading
    ? "Laddar kopplingar…"
    : `${activeCount} kopplade`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={PlugZap}
        title="Kopplingar"
        description={
          <>
            Alla integrationer för{" "}
            <span className="font-medium text-foreground">
              {legacy.activeProfile?.name ?? "denna företagsprofil"}
            </span>
            . Koppla eller koppla från konton, se hälsa och status för omkoppling.
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
              Uppdatera
            </Button>
          </div>
        }
      />

      <PageSmartBar
        title="Det här är navet för all data in i appen — utan kopplingar fylls inte Meddelanden, Innehåll eller Insikter."
        steps={[
          "Koppla de kanaler du jobbar med (mail, socialt, recensioner …)",
          "Kontrollera status — gult/rött betyder att du behöver koppla om eller synka",
          "Använd kopplingarna i resten av appen (publicera, svara, rapportera)",
        ]}
        tip="Efter koppling: fyll i Företag (beskrivning + webb) så AI och automationer får rätt kontext. Hälsa visar problem samlat."
        liveHintOverride={
          healthIssueCount > 0
            ? `${healthIssueCount} koppling${healthIssueCount === 1 ? "" : "ar"} behöver åtgärd — öppna fliken Hälsa`
            : null
        }
        extraActions={
          healthIssueCount > 0
            ? [{ label: "Visa hälsa", to: "/connections?tab=health" }]
            : []
        }
      />

      {oauthErrorDetails ? (
        <OAuthErrorAlert
          details={oauthErrorDetails}
          message={formatOAuthErrorMessage(oauthErrorDetails)}
          onDismiss={clearOauthError}
        />
      ) : null}

      {!isLoading && activeCount === 0 ? (
        <Alert className="border-primary/30 bg-primary/[0.04]">
          <PlugZap className="h-4 w-4" />
          <AlertTitle>Kom igång med första kopplingen</AlertTitle>
          <AlertDescription className="text-sm leading-relaxed">
            Börja med de kanaler du använder mest (t.ex. Instagram, Gmail eller Google Ads). Öppna
            ett kort nedan och välj den rekommenderade kopplingsvägen — du kan alltid byta eller
            lägga till fler senare. API-nycklar och tester finns under{" "}
            <Link to="/preferences?tab=api-keys" className="font-medium text-primary underline underline-offset-2">
              Inställningar → API-nycklar
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {searchParams.get("next") === "company" ? (
        <Alert className="border-primary/30 bg-primary/[0.04]">
          <Building2 className="h-4 w-4" />
          <AlertTitle>Nästa steg: fyll i bolagsprofilen</AlertTitle>
          <AlertDescription className="text-sm leading-relaxed">
            När du kopplat det du behöver här, gå till{" "}
            <Link to="/company" className="font-medium text-primary underline underline-offset-2">
              Företag
            </Link>{" "}
            och hämta data med org.nr — det gör lead-förslagen mycket bättre.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/80">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="business-website" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Globe2 className="h-3.5 w-3.5" />
              Webbplats
            </Label>
            <Input
              id="business-website"
              type="url"
              inputMode="url"
              value={websiteInput}
              onChange={(event) => setWebsiteInput(event.target.value)}
              placeholder="https://example.com"
              disabled={!legacy.activeProfile}
            />
            <p className="text-[11px] text-muted-foreground">
              Används av Digitalt varumärke för SEO, förtroende och innehållsrekommendationer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {safeWebsiteUrl(legacy.activeProfile?.website) ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={safeWebsiteUrl(legacy.activeProfile?.website) ?? "#"} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Öppna sajt
                </a>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to="/digital-brand">Digitalt varumärke</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveWebsite()}
              disabled={!legacy.activeProfile || websiteSaving}
            >
              {websiteSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Spara URL
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConnectionsTab)}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0 border-b border-border rounded-none w-full">
          <TabsTrigger value="integrations" className="text-xs data-[state=active]:bg-muted rounded-b-none">
            Integrationer
          </TabsTrigger>
          <TabsTrigger value="mcp" className="text-xs data-[state=active]:bg-muted rounded-b-none gap-1.5">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            MCP
          </TabsTrigger>
          <TabsTrigger value="health" className="text-xs data-[state=active]:bg-muted rounded-b-none gap-1.5">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            Hälsa
            {healthIssueCount > 0 ? (
              <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                {healthIssueCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4 space-y-4">
          <ConnectionsControlPanel
            businessProfileId={businessProfileId}
            connections={connections}
            onRefreshConnections={() => refetch()}
          />
        </TabsContent>

        <TabsContent value="mcp" className="mt-4 space-y-4">
          <Card className="border-border/80">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground max-w-xl">
                  Alla {getConnectionEntriesForArea("intelligence").length} MCP-dataleverantörer — koppla här, kör multi-source-jämförelse och frågor på{" "}
                  <Link to="/intelligence" className="text-primary hover:underline">
                    MCP Intelligence
                  </Link>
                  .
                </p>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                  <Link to="/intelligence">
                    Öppna MCP Intelligence
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
              <McpProviderStatusList businessProfileId={businessProfileId} />
            </CardContent>
          </Card>
          <McpDataCatalog businessProfileId={businessProfileId} />
          <McpToolsExplorer businessProfileId={businessProfileId} />
          {!isLoading ? (
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
              needsAttentionOnly={needsAttentionOnly}
              searchQuery={searchQuery}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              manuallyConnectedPlatforms={manuallyConnectedPlatforms}
              onManualConnectionChange={handleManualConnectionChange}
              mcpReadinessByPlatform={mcpReadinessByPlatform}
              areasFilter={["intelligence"]}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
      <div className="app-workspace-shell">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            <strong>{selectedIds.size}</strong> markerade
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Rensa markering
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
              Koppla från
            </Button>
          </div>
        </div>
      )}

      <div className="app-workspace-toolbar px-3 py-2 sm:px-4">
      <PageToolbar trailing={summary} className="w-full">
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
          onValueChange={(v) => setStatusFilter(v as StatusFilterValue)}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Filtrera på status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            <SelectItem value="needs_attention">Behöver uppmärksamhet</SelectItem>
            {CONNECTION_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {CONNECTION_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reconcileState.updated != null ? (
          <span className="text-[11px] text-success">
            Uppdaterade {reconcileState.updated} koppling
            {reconcileState.updated === 1 ? "" : "ar"}
          </span>
        ) : null}
        {reconcileState.error ? (
          <span className="text-[11px] text-destructive">
            {reconcileState.error}
          </span>
        ) : null}
      </PageToolbar>
      </div>

      <div className="app-workspace-stats flex flex-wrap gap-2 px-3 py-2 sm:px-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Kopplade</p>
          <p className="text-xs font-semibold tabular-nums">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Behöver åtgärd</p>
          <p className="text-xs font-semibold tabular-nums text-destructive">{healthIssueCount}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Sök/filter</p>
          <p className="text-xs font-semibold tabular-nums">{searchQuery.trim() || statusFilter !== "all" ? "Aktivt" : "Av"}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto app-scroll p-3 sm:p-4">
      {isLoading ? (
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-10 rounded-xl" />
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
          needsAttentionOnly={needsAttentionOnly}
          searchQuery={searchQuery}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          manuallyConnectedPlatforms={manuallyConnectedPlatforms}
          onManualConnectionChange={handleManualConnectionChange}
          mcpReadinessByPlatform={mcpReadinessByPlatform}
          areasExclude={["intelligence"]}
        />
      )}
      </div>
      </div>
        </TabsContent>
      </Tabs>

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
