import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/relativeTime";
import { CheckSquare2, Info, Layers, Link2, Loader2, PlugZap, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ConnectionCatalogEntry } from "@/lib/connectionCatalog";
import type { Connection } from "@/types/connection";
import { ConnectionHealthBadge } from "./ConnectionHealthBadge";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { aggregateStatus } from "./connectionStatus";
import { connectionFixHint, connectionTestToastMessage } from "./connectionFixHints";
import type { ConnectionTestResult } from "./useConnections";
import { buildConnectUrl } from "./zernioClient";
import { getConnectConfig, getConnectionPathOptions } from "./connectAuthPath";
import {
  buildMcpOAuthConnectUrl,
  getMcpProviderMeta,
  isMcpPlatform,
  mcpManualConnectUrl,
} from "./mcpProviders";
import type { IntelligencePlatform } from "@/types/accounts";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import { ShopifyConnectGuide } from "@/features/ecommerce/ShopifyConnectGuide";
import { normalizeShopifyShopDomain, SHOPIFY_DOMAIN_EXAMPLE } from "@/features/ecommerce/shopifyConnect";
import { useAccounts } from "@/context/AccountsContext";
import { McpReadinessHint } from "@/features/intelligence/McpReadinessHint";
import type { McpProviderReadiness } from "@/features/intelligence/intelligenceService";

interface Props {
  entry: ConnectionCatalogEntry;
  activeConnections: Connection[];
  businessProfileId: string;
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
 * Single integration card: shows catalog info, linked accounts, health,
 * last sync, and Connect / Reconnect / Disconnect / Details actions.
 *
 * All auth-bearing actions go through `buildConnectUrl` → server `/api/auth/*`
 * → Zernio (or native OAuth fallback). The card never talks to a provider
 * directly.
 */
export function ConnectionCard({
  entry,
  activeConnections,
  businessProfileId,
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
      const res = await fetchWithTimeout(mcpManualConnectUrl(entry.platform as IntelligencePlatform), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, `Could not connect ${entry.label}.`));
      }
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

  const primaryLabel = active.length === 0 ? "Connect" : reconnectNeeded ? "Reconnect" : "Add / reconnect";
  const PrimaryIcon = active.length === 0 ? Link2 : RefreshCw;
  const defaultPathOption = pathOptions.find((option) => option.isDefault) ?? pathOptions[0];
  const extraPathLabels = pathOptions
    .filter((option) => option.label !== defaultPathOption?.label)
    .map((option) => option.label);

  return (
    <>
    <Card className="border-border/80">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {entry.label}
            </CardTitle>
            <CardDescription className="text-xs">{entry.connectSteps}</CardDescription>
          </div>
          <ConnectionStatusBadge status={displayStatus} />
        </div>
        {defaultPathOption ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] leading-none">
            <span className="text-muted-foreground/70">Paths</span>
            <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-muted-foreground">
              Default: {defaultPathOption.label}
            </span>
            {extraPathLabels.length > 0 ? (
              <span className="rounded-full border border-border bg-background/70 px-2 py-1 text-muted-foreground">
                Extra: {extraPathLabels.join(" / ")}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isMcpPlatform(entry.platform) && mcpReadiness ? (
          <McpReadinessHint readiness={mcpReadiness} />
        ) : null}
        {entry.platform === "canva" && manuallyConnected ? (
          <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            Ready for Canva exports on this business profile.
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
                    Connected{" "}
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
                  {onResync ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => void handleTestConnection(c.id)}
                      disabled={isResyncing}
                      aria-label={`Test connection for ${c.displayName || c.username}`}
                      title="Test connection"
                    >
                      {isResyncing && resyncingId === c.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <PlugZap className="h-3 w-3" />
                      )}
                      Test
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setRemoveTarget(c)}
                    disabled={isDisconnecting}
                    aria-label={`Disconnect ${c.displayName || c.username}`}
                    title="Disconnect — removes the account permanently"
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
          <p className="text-xs text-muted-foreground">Not connected for this business profile yet.</p>
        )}

        {firstError ? (
          <p className="text-[11px] text-destructive break-words">{firstError}</p>
        ) : null}

        {lastSync ? (
          <p className="text-[11px] text-muted-foreground">Last sync {lastSync}</p>
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
                  Connect via Zernio
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
      </CardContent>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {removeTarget?.displayName || removeTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account will be removed and its stored tokens cleared. You can connect a different
              account in its place. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeTarget) onDisconnect(removeTarget.id);
                setRemoveTarget(null);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Shopify</DialogTitle>
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
            Cancel
          </Button>
          <Button onClick={submitShopifyConnect} disabled={!shopifyShop.trim()}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect {entry.label}</DialogTitle>
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
            Cancel
          </Button>
          <Button
            onClick={() => void submitMcpManualConnect()}
            disabled={
              mcpConnecting ||
              (mcpMeta?.auth === "shop_domain" && !mcpCredential.trim()) ||
              (mcpMeta?.auth === "api_key" && entry.platform !== "sprouts" && !mcpCredential.trim())
            }
          >
            {mcpConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
