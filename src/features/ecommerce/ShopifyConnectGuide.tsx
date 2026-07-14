import { ExternalLink } from "lucide-react";
import { SHOPIFY_DOMAIN_EXAMPLE } from "./shopifyConnect";

export function ShopifyConnectGuide() {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-sm">
      <p className="font-medium text-foreground">Så hittar du rätt Shopify-domän</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>Öppna Shopify Admin för butiken du vill koppla.</li>
        <li>Gå till <span className="font-medium text-foreground">Settings → Domains</span>.</li>
        <li>
          Kopiera domänen som slutar på{" "}
          <span className="font-medium text-foreground">.myshopify.com</span>, till exempel{" "}
          <span className="font-mono text-foreground">{SHOPIFY_DOMAIN_EXAMPLE}</span>.
        </li>
        <li>Klistra in domänen här. Använd inte en egen publik domän som bara pekar till butiken.</li>
        <li>Tryck Continue/Connect och godkänn åtkomsten i Shopify.</li>
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Får du <span className="font-medium text-foreground">missing_shopify_permission</span> (t.ex.{" "}
        <span className="font-mono text-foreground">customer_read_quick_sale</span>)? Det betyder att Shopify-appen
        begär en rättighet som inte är godkänd. Öppna{" "}
        <a
          href="https://partners.shopify.com/"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Partner Dashboard
        </a>
        , gå till din app → Configuration → Access scopes, ta bort ogodkända <span className="font-mono">customer_*</span>
        -scopes och spara. Koppla om butiken — standard är bara <span className="font-mono">read_products</span>.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <a
          href="https://admin.shopify.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Öppna Shopify Admin
          <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="https://help.shopify.com/en/manual/domains"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Shopifys guide om Domains
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
