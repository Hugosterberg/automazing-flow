import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SHOPIFY_DOMAIN_EXAMPLE } from "./shopifyConnect";

export function ShopifyConnectGuide() {
  const { t } = useTranslation("ecommerce");

  return (
    <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-sm">
      <p className="font-medium text-foreground">{t("shopifyGuide.title")}</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>{t("shopifyGuide.steps.openAdmin")}</li>
        <li>{t("shopifyGuide.steps.goToDomains")}</li>
        <li>{t("shopifyGuide.steps.copyDomain", { example: SHOPIFY_DOMAIN_EXAMPLE })}</li>
        <li>{t("shopifyGuide.steps.pasteDomain")}</li>
        <li>{t("shopifyGuide.steps.approveAccess")}</li>
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {t("shopifyGuide.permissionHint")}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <a
          href="https://admin.shopify.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {t("shopifyGuide.openShopifyAdmin")}
          <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="https://help.shopify.com/en/manual/domains"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {t("shopifyGuide.domainsGuide")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
