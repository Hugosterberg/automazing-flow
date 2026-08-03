import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/apiJson";
import { SHOPIFY_DOMAIN_EXAMPLE } from "@/features/ecommerce/shopifyConnect";
import { JUDGEME_TOKEN_HELP, normalizeJudgemeShopDomain } from "./judgemeConnect";

export interface JudgemeConnectResult {
  accountId: string;
  username: string;
  profileId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active business profile — scopes the stored credentials. */
  businessProfileId: string | null;
  onConnected: (result: JudgemeConnectResult) => void;
}

/**
 * Judge.me connect flow (shop domain + private API token).
 *
 * Shared by the Connections page and the sidebar so both surfaces validate
 * identically and there is a single place to change the copy. Credentials go
 * straight to `/api/auth/judgeme/manual-connect`, which verifies them against
 * the live Judge.me API before storing anything.
 */
export function JudgemeConnectDialog({ open, onOpenChange, businessProfileId, onConnected }: Props) {
  const [shopDomain, setShopDomain] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const normalizedDomain = normalizeJudgemeShopDomain(shopDomain);
  const domainLooksWrong = shopDomain.trim().length > 0 && !normalizedDomain;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setShopDomain("");
      setApiToken("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    const token = apiToken.trim();
    if (!normalizedDomain) {
      setError(`Ange butikens domän, till exempel ${SHOPIFY_DOMAIN_EXAMPLE}.`);
      return;
    }
    if (!token) {
      setError("Privat API-token krävs.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const payload = await apiJson<Record<string, unknown>>(
        "/api/auth/judgeme/manual-connect",
        "Kunde inte koppla Judge.me.",
        {
          body: {
            shopDomain: normalizedDomain,
            apiToken: token,
            profileId: businessProfileId,
            business_profile_id: businessProfileId,
          },
        }
      );
      onConnected({
        accountId: String(payload.account_id || ""),
        username: String(payload.username || normalizedDomain),
        profileId: payload.profile_id ? String(payload.profile_id) : businessProfileId,
      });
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte koppla Judge.me.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Koppla Judge.me</DialogTitle>
          <DialogDescription>
            Ange butikens domän och den privata API-token. Uppgifterna verifieras mot Judge.me innan de sparas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="judgeme-shop-domain">Shop-domän</Label>
            <Input
              id="judgeme-shop-domain"
              value={shopDomain}
              onChange={(event) => {
                setShopDomain(event.target.value);
                setError(null);
              }}
              placeholder={SHOPIFY_DOMAIN_EXAMPLE}
              aria-invalid={domainLooksWrong}
              aria-describedby="judgeme-shop-domain-hint"
              autoFocus
            />
            <p id="judgeme-shop-domain-hint" className="text-xs text-muted-foreground">
              {domainLooksWrong
                ? `Ser inte ut som en butiksdomän. Använd formatet ${SHOPIFY_DOMAIN_EXAMPLE}.`
                : normalizedDomain && normalizedDomain !== shopDomain.trim().toLowerCase()
                  ? `Kopplas som ${normalizedDomain}`
                  : "Butikens permanenta domän, samma som i Judge.me."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="judgeme-api-token">Privat API-token</Label>
            <Input
              id="judgeme-api-token"
              type="password"
              value={apiToken}
              onChange={(event) => {
                setApiToken(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => event.key === "Enter" && void submit()}
              placeholder="Private API token"
              aria-describedby="judgeme-api-token-hint"
            />
            <p id="judgeme-api-token-hint" className="text-xs text-muted-foreground">
              {JUDGEME_TOKEN_HELP}
            </p>
          </div>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={connecting}>
            Avbryt
          </Button>
          <Button onClick={() => void submit()} disabled={connecting || !normalizedDomain || !apiToken.trim()}>
            {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Koppla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
