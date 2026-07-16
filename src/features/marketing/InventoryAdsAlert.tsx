import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarketingCampaigns } from "./useMarketingCampaigns";

/**
 * Cross-source guardrail: warns when ads are live but the advertised store is
 * out of (or low on) stock — i.e. budget is likely being spent driving traffic
 * to products people can't buy. Only shown when both conditions hold.
 */
export function InventoryAdsAlert() {
  const { t } = useTranslation("marketing");
  const { inventoryAlert } = useMarketingCampaigns();
  if (!inventoryAlert) return null;
  const { activeCampaigns, outOfStock, lowStock, threshold, examples } = inventoryAlert;

  const stockParts: string[] = [];
  if (outOfStock > 0) {
    stockParts.push(t("inventoryAlert.outOfStock", { count: outOfStock }));
  }
  if (lowStock > 0) {
    stockParts.push(t("inventoryAlert.lowStock", { count: lowStock, threshold }));
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
      <div className="rounded-md bg-warning/15 p-2 shrink-0">
        <PackageX className="h-4 w-4 text-warning" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{t("inventoryAlert.title")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("inventoryAlert.body", {
            count: activeCampaigns,
            activeCampaigns,
            stockParts: stockParts.join(t("inventoryAlert.and")),
          })}
          {examples.length > 0 ? t("inventoryAlert.examples", { examples: examples.join(", ") }) : ""}
          {t("inventoryAlert.footer")}
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-1">{t("inventoryAlert.calculation")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link to="/ecommerce">{t("inventoryAlert.viewEcommerce")}</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link to="/marketing?tab=ads">{t("inventoryAlert.reviewCampaigns")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
