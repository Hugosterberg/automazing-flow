import { PackageX } from "lucide-react";
import { useMarketingCampaigns } from "./useMarketingCampaigns";

/**
 * Cross-source guardrail: warns when ads are live but the advertised store is
 * out of (or low on) stock — i.e. budget is likely being spent driving traffic
 * to products people can't buy. Only shown when both conditions hold.
 */
export function InventoryAdsAlert() {
  const { inventoryAlert } = useMarketingCampaigns();
  if (!inventoryAlert) return null;
  const { activeCampaigns, outOfStock, lowStock, threshold, examples } = inventoryAlert;

  const stockParts: string[] = [];
  if (outOfStock > 0) stockParts.push(`${outOfStock} slutsåld${outOfStock === 1 ? "" : "a"}`);
  if (lowStock > 0) stockParts.push(`${lowStock} lågt i lager (≤ ${threshold})`);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
      <div className="rounded-md bg-warning/15 p-2 shrink-0">
        <PackageX className="h-4 w-4 text-warning" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Annonser igång men hyllorna är tomma</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {activeCampaigns} aktiv{activeCampaigns === 1 ? " kampanj" : "a kampanjer"} körs medan {stockParts.join(" och ")}.
          {examples.length > 0 ? ` T.ex. ${examples.join(", ")}.` : ""} Pausa eller fyll på lagret för att inte
          bränna budget.
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-1">
          Beräknas: aktiva kampanjer (Meta/Google) × Shopify-produkter med spårat lager på eller under tröskeln.
        </p>
      </div>
    </div>
  );
}
