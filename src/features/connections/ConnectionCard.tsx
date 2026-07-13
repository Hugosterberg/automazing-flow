import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/relativeTime";
import { CheckSquare2, ChevronRight, Info, Layers, Link2, Loader2, PlugZap, RefreshCw, Square, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AREA_LABELS, type AppArea, type ConnectionCatalogEntry } from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { aggregateStatus, statusFromConnection } from "./connectionStatus";
import { connectionFixHint, connectionTestToastMessage } from "./connectionFixHints";
import type { ConnectionTestResult } from "./useConnections";
import { buildConnectUrl } from "./zernioClient";
import { getConnectConfig, getConnectionPathOptions } from "./connectAuthPath";
import {
  buildMcpOAuthConnectUrl,
  getMcpProviderMeta,
  isMcpPlatform,
  mcpManualConnectPath,
} from "./mcpProviders";
import type { IntelligencePlatform } from "@/types/accounts";
import { apiJson } from "@/lib/apiJson";
import { ShopifyConnectGuide } from "@/features/ecommerce/ShopifyConnectGuide";
import { normalizeShopifyShopDomain, SHOPIFY_DOMAIN_EXAMPLE } from "@/features/ecommerce/shopifyConnect";
import { useAccounts } from "@/context/AccountsContext";
import { McpReadinessHint } from "@/features/intelligence/McpReadinessHint";
import type { McpProviderReadiness } from "@/features/intelligence/intelligenceService";

interface Props {
  entry: ConnectionCatalogEntry;
  activeConnections: Connection[];
  businessProfileId: string;
  /** Area section the row is rendered under — used to hint the entry's other areas. */
  currentArea?: AppArea;
  mcpReadiness?: McpProviderReadiness | null;
  onDisconnect: (connectionId: string) => void;
  isDisconnecting: boolean;
  onResync?: (connectionId: string) => Promise<ConnectionTestResult | void>;
  isResyncing?: boolean;
  resyncingId?: string;
  onViewDetails?: (connection: Connection) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  manuallyConnected?: boolean;
  onManualConnectionChange?: (platform: ConnectionCatalogEntry["platform"], connected: boolean) => void;
}

/**
 * Single integration row: a slim always-visible summary line (label, status,
 * linked accounts, quick Connect) that expands to the full details — accounts
 * with health/test/disconnect, connect paths, and setup guidance. Compact by
 * design: many connections must stay scannable as the catalog grows.
 *
 * All auth-bearing actions go through `buildConnectUrl` → server `/api/auth/*`
 * → Zernio (or native OAuth fallback). The row never talks to a provider
 * directly.
 */
export function ConnectionCard({
  entry,
  activeConnections,
  businessProfileId,
  currentArea,
  mcpReadiness,
  onDisconnect,
  isDisconnecting,
  onResync,
  isResyncing,
  resyncingId,
  onViewDetails,
  selectedIds,
  onToggleSelect,
  manuallyConnected = false,
}: Props) {
  // Rows that need action start expanded so the fix hint is visible at once.
  const [expanded, setExpanded] = useState(() => {
    const initialStatus = aggregateStatus(
      activeConnections.filter((c) => c.platform === entry.platform)
    );
    return initialStatus === "error" || initialStatus === "reconnect_required";
  });
  const [removeTarget, setRemoveTarget] = useState<Connection | null>(null);
  const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false);
  const [shopifyShop, setShopifyShop] = useState("");
  const [shopifyShopError, setShopifyShopError] = useState<string | null>(null);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [mcpCredential, setMcpCredential] = useState("");
  const [mcpCredentialError, setMcpCredentialError] = useState<string | null>(null);
  const [mcpConnecting, setMcpConnecting] = useState(false);
  const { addAccountFromOAuth } = useAccounts();
  const mcpMeta = getMcpProviderMeta(entry.platform);
  const rows = useMemo(
    () => activeConnections.filter((c) => c.platform === entry.platform),
    [activeConnections, entry.platform]
  );
  const active = rows;

  const connectConfig = getConnectConfig(entry.platform);
  const pathOptions = getConnectionPathOptions(entry.platform);
  const status = useMemo(() => aggregateStatus(rows), [rows]);
  const displayStatus = manuallyConnected ? "connected" : status;
  const reconnectNeeded = status === "reconnect_required";

  function startConnect(
    provider?: "zernio" | "official",
    params?: Record<string, string | null | undefined>
  ) {
    if (!connectConfig) return;
    window.location.href = buildConnectUrl(connectConfig.authPath, businessProfileId, {
      provider: provider ?? connectConfig.provider,
      params,
    });
  }

  function startShopifyConnect() {
    setShopifyShop("");
    setShopifyShopError(null);
    setShopifyDialogOpen(true);
  }

  function submitShopifyConnect() {
    const shop = normalizeShopifyShopDomain(shopifyShop);
    if (!shop) {
      setShopifyShopError(`Ange butikens .myshopify.com-domän, till exempel ${SHOPIFY_DOMAIN_EXAMPLE}.`);
      return;
    }
    setShopifyDialogOpen(false);
    setShopifyShop("");
    setShopifyShopError(null);
    startConnect(undefined, { shop });
  }

  function startMcpConnect() {
    if (!mcpMeta) return;
    if (mcpMeta.auth === "oauth") {
      window.location.href = buildMcpOAuthConnectUrl(entry.platform as IntelligencePlatform, businessProfileId);
      return;
    }
    if (mcpMeta.auth === "keyless") {
      void submitMcpManualConnect({ keyless: true });
      return;
    }
    setMcpCredential("");
    setMcpCredentialError(null);
    setMcpDialogOpen(true);
  }

  async function submitMcpManualConnect(options?: { keyless?: boolean }) {
    if (!mcpMeta) return;
    const trimmed = mcpCredential.trim();
    if (mcpMeta.auth === "shop_domain") {
      const shop = normalizeShopifyShopDomain(trimmed);
      if (!shop) {
        setMcpCredentialError(`Ange butikens .myshopify.com-domän, till exempel ${SHOPIFY_DOMAIN_EXAMPLE}.`);
        return;
      }
    } else if (!options?.keyless && !trimmed && entry.platform !== "sprouts") {
      setMcpCredentialError("Credential krävs.");
      return;
    }
    setMcpConnecting(true);
    setMcpCredentialError(null);
    try {
      const body =
        mcpMeta.auth === "shop_domain"
          ? { shopDomain: normalizeShopifyShopDomain(trimmed), profileId: businessProfileId }
          : { apiKey: trimmed, profileId: businessProfileId };
      const payload = await apiJson<Record<string, unknown>>(
        mcpManualConnectPath(entry.platform as IntelligencePlatform),
        `Could not connect ${entry.label}.`,
        { body }
      );
      setMcpDialogOpen(false);
      setMcpCredential("");
      toast.success(`${entry.label} connected`);
      if (payload.account_id && payload.platform) {
        addAccountFromOAuth(
          String(payload.account_id),
          payload.platform as IntelligencePlatform,
          String(payload.username || entry.label),
          payload.profile_id ? String(payload.profile_id) : businessProfileId,
          { displayName: entry.label, profileUrl: entry.pageHref }
        );
      }
      window.dispatchEvent(new CustomEvent("automazing:connections-changed"));
    } catch (err) {
      setMcpCredentialError(err instanceof Error ? err.message : "Kunde inte ansluta.");
    } finally {
      setMcpConnecting(false);
    }
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

  async function handleTestConnection(connectionId: string) {
    if (!onResync) return;
    try {
      const result = await onResync(connectionId);
      if (!result) return;
      const toastMsg = connectionTestToastMessage(result);
      if (result.health === "healthy") {
        toast.success(toastMsg.title, { description: toastMsg.description });
      } else {
        toast.error(toastMsg.title, { description: toastMsg.description });
      }
    } catch (err) {
      toast.error("Connection test failed", {
        description: err instanceof Error ? err.message : "Could not test the connection.",
      });
    }
  }

  const primaryLabel = active.length === 0 ? "Koppla" : reconnectNeeded ? "Koppla om" : "Lägg till / koppla om";
  const PrimaryIcon = active.length === 0 ? Link2 : RefreshCw;
  const defaultPathOption = pathOptions.find((option) => option.isDefault) ?? pathOptions[0];
  const extraPathLabels = pathOptions
    .filter((option) => option.label !== defaultPathOption?.label)
    .map((option) => option.label);

  const otherAreas = currentArea ? entry.areas.filter((area) => area !== currentArea) : [];
  const dualPath =
    entry.platform === "google_ads" ||
    entry.platform === "google_business" ||
    entry.platform === "tripadvisor";
  const hasDirectConnect = Boolean(
    connectConfig && (!connectConfig.manual || isMcpPlatform(entry.platform))
  );

  /** Quick action on the collapsed row: connect directly when the path is
   *  unambiguous, otherwise expand so the user can pick (or read setup steps). */
  function handleQuickConnect() {
    if (!hasDirectConnect || dualPath) {
      setExpanded(true);
      return;
    }
    if (isMcpPlatform(entry.platform)) {
      startMcpConnect();
      return;
    }
    if (entry.platform === "shopify") {
      startShopifyConnect();
      return;
    }
    startConnect();
  }

  return (
    <>
    <Card className="border-border/80 overflow-hidden">
      {/* Slim summary row — always visible */}
      <div className="flex items-center gap-2 pl-2 pr-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/40"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
          <span
            className={cn(
              "truncate text-sm",
              rows.length > 0 || manuallyConnected
                ? "font-medium"
                : "font-normal text-muted-foreground"
            )}
          >
            {entry.label}
          </span>
          {/* "Not connected" is already told by the muted label + Connect
              button; a badge on every unlinked row would just be noise. */}
          {displayStatus !== "not_connected" ? (
            <ConnectionStatusBadge status={displayStatus} />
          ) : null}
          {rows.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="hidden sm:inline-flex max-w-[150px] truncate rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {c.displayName || `@${c.username}`}
            </span>
          ))}
          {rows.length > 2 ? (
            <span className="hidden sm:inline text-[10px] text-muted-foreground tabular-nums">
              +{rows.length - 2}
            </span>
          ) : null}
          {firstError && !expanded ? (
            <TriangleAlert
              className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-label="Has sync error"
            />
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-2 pr-1">
            {otherAreas.length > 0 ? (
              <span className="hidden lg:inline text-[10px] text-muted-foreground/70">
                Also in {otherAreas.map((area) => AREA_LABELS[area]).join(", ")}
              </span>
            ) : null}
            {lastSync ? (
              <span className="hidden md:inline text-[10px] text-muted-foreground tabular-nums">
                {lastSync}
              </span>
            ) : null}
          </span>
        </button>
        <Button
          type="button"
          size="sm"
          variant={reconnectNeeded ? "default" : active.length === 0 ? "outline" : "ghost"}
          className={cn(
            "h-6 shrink-0 px-2 text-[11px] font-normal",
            active.length > 0 && !reconnectNeeded && "text-muted-foreground hover:text-foreground"
          )}
          onClick={handleQuickConnect}
          disabled={mcpConnecting && mcpMeta?.auth === "keyless"}
        >
          {mcpConnecting && mcpMeta?.auth === "keyless" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          {active.length === 0 ? "Koppla" : reconnectNeeded ? "Koppla om" : "Lägg till"}
        </Button>
      </div>

      {expanded ? (
      <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2.5">
        <p className="text-xs text-muted-foreground">{entry.connectSteps}</p>
        {defaultPathOption ? (
          <p className="text-[11px] text-muted-foreground">
            Rekommenderad väg:{" "}
            <span className="font-medium text-foreground/90">{defaultPathOption.label}</span>
            {extraPathLabels.length > 0 ? (
              <span className="text-muted-foreground/80">
                {" "}
                · Alternativ: {extraPathLabels.join(" / ")}
              </span>
            ) : null}
          </p>
        ) : null}
        {isMcpPlatform(entry.platform) && mcpReadiness ? (
          <McpReadinessHint readiness={mcpReadiness} />
        ) : null}
        {entry.platform === "canva" && manuallyConnected ? (
          <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            Redo för Canva-exporter från den här företagsprofilen.
          </div>
        ) : rows.length > 0 ? (
          <ul className="space-y-1.5">
            {rows.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs"
              >
                {onToggleSelect && (
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
                    Kopplad{" "}
                    {c.connectedAt
                      ? formatRelativeTime(c.connectedAt) ?? c.connectedAt.slice(0, 10)
                      : ""}
                  </p>
                  {c.health !== "healthy" ? (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-snug">
                      {connectionFixHint(c, entry)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <ConnectionStatusBadge status={statusFromConnection(c)} />
                  {onViewDetails ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onViewDetails(c)}
                      aria-label={`Visa detaljer för ${c.displayName || c.username}`}
                    >
                      <Info className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {onResync ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => void handleTestConnection(c.id)}
                      disabled={isResyncing}
                      aria-label={`Testa koppling för ${c.displayName || c.username}`}
                      title="Testa koppling"
                    >
                      {isResyncing && resyncingId === c.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <PlugZap className="h-3 w-3" />
                      )}
                      Testa
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setRemoveTarget(c)}
                    disabled={isDisconnecting}
                    aria-label={`Koppla från ${c.displayName || c.username}`}
                    title="Koppla från — tar bort kontot permanent"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {active.length === 0
              ? "Inte kopplat för den här företagsprofilen ännu."
              : "Konto kopplat för den här företagsprofilen."}
          </p>
        )}

        {firstError ? (
          <p className="text-[11px] text-destructive break-words">{firstError}</p>
        ) : null}

        {lastSync ? (
          <p className="text-[11px] text-muted-foreground">Senaste synk {lastSync}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {connectConfig && (!connectConfig.manual || isMcpPlatform(entry.platform)) ? (
            entry.platform === "google_ads" ||
            entry.platform === "google_business" ||
            entry.platform === "tripadvisor" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={active.length === 0 || reconnectNeeded ? "default" : "outline"}
                  className="gap-1.5"
                  onClick={() =>
                    startConnect(
                      (defaultPathOption?.id === "zernio" || defaultPathOption?.id === "official"
                        ? defaultPathOption.id
                        : "official") as "official" | "zernio"
                    )
                  }
                >
                  <PrimaryIcon className="h-3.5 w-3.5" />
                  {defaultPathOption?.id === "zernio" ? "Koppla via Zernio" : "Koppla (rekommenderat)"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() =>
                    startConnect(
                      defaultPathOption?.id === "zernio" ? "official" : "zernio"
                    )
                  }
                >
                  <Layers className="h-3.5 w-3.5" />
                  {defaultPathOption?.id === "zernio" ? "Använd Official API" : "Koppla via Zernio"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={active.length === 0 || reconnectNeeded ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => {
                  if (isMcpPlatform(entry.platform)) {
                    startMcpConnect();
                    return;
                  }
                  if (entry.platform === "shopify") {
                    startShopifyConnect();
                    return;
                  }
                  startConnect();
                }}
                disabled={mcpConnecting && mcpMeta?.auth === "keyless"}
              >
                {mcpConnecting && mcpMeta?.auth === "keyless" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PrimaryIcon className="h-3.5 w-3.5" />
                )}
                {primaryLabel}
              </Button>
            )
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              asChild
            >
              <Link to={entry.pageHref}>
                <PrimaryIcon className="h-3.5 w-3.5" />
                Setup in {entry.pageName}
              </Link>
            </Button>
          )}
          {entry.platform === "canva" ? (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" asChild>
              <Link to="/social-media?create=canva">
                <PrimaryIcon className="h-3.5 w-3.5" />
                Create post image
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      ) : null}

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Koppla från {removeTarget?.displayName || removeTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              Kontot tas bort och sparade tokens rensas. Du kan koppla ett annat konto i stället. Detta går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeTarget) onDisconnect(removeTarget.id);
                setRemoveTarget(null);
              }}
            >
              Koppla från
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Koppla Shopify</DialogTitle>
          <DialogDescription>
            Koppla rätt butik genom att ange butikens permanenta Shopify-domän.
          </DialogDescription>
        </DialogHeader>
        <ShopifyConnectGuide />
        <div className="space-y-2">
          <Label htmlFor={`shopify-shop-${entry.platform}`}>Shop domain</Label>
          <Input
            id={`shopify-shop-${entry.platform}`}
            value={shopifyShop}
            onChange={(event) => {
              setShopifyShop(event.target.value);
              setShopifyShopError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && submitShopifyConnect()}
            placeholder={SHOPIFY_DOMAIN_EXAMPLE}
            aria-invalid={Boolean(shopifyShopError)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Du kan också klistra in en Shopify Admin-länk, t.ex. admin.shopify.com/store/mystore.
          </p>
          {shopifyShopError ? <p className="text-xs text-destructive">{shopifyShopError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShopifyDialogOpen(false)}>
            Avbryt
          </Button>
          <Button onClick={submitShopifyConnect} disabled={!shopifyShop.trim()}>
            Fortsätt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Koppla {entry.label}</DialogTitle>
          <DialogDescription>{entry.connectSteps}</DialogDescription>
        </DialogHeader>
        {mcpMeta?.auth === "shop_domain" ? <ShopifyConnectGuide /> : null}
        <div className="space-y-2">
          <Label htmlFor={`mcp-credential-${entry.platform}`}>{mcpMeta?.credentialLabel ?? "Credential"}</Label>
          <Input
            id={`mcp-credential-${entry.platform}`}
            type={mcpMeta?.auth === "api_key" ? "password" : "text"}
            value={mcpCredential}
            onChange={(event) => {
              setMcpCredential(event.target.value);
              setMcpCredentialError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && void submitMcpManualConnect()}
            placeholder={mcpMeta?.credentialPlaceholder}
            aria-invalid={Boolean(mcpCredentialError)}
            autoFocus
          />
          {mcpCredentialError ? <p className="text-xs text-destructive">{mcpCredentialError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setMcpDialogOpen(false)} disabled={mcpConnecting}>
            Avbryt
          </Button>
          <Button
            onClick={() => void submitMcpManualConnect()}
            disabled={
              mcpConnecting ||
              (mcpMeta?.auth === "shop_domain" && !mcpCredential.trim()) ||
              (mcpMeta?.auth === "api_key" && entry.platform !== "sprouts" && !mcpCredential.trim())
            }
          >
            {mcpConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Koppla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
