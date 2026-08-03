import { normalizeShopifyShopDomain } from "@/features/ecommerce/shopifyConnect";

/**
 * Client mirror of `normalizeJudgemeShopDomain` on the server, so the connect
 * dialog can show the resolved domain and reject obvious typos before a
 * round-trip. The server still normalizes authoritatively — this only exists
 * to make the field give feedback while typing.
 *
 * Judge.me's `shop_domain` is the store's permanent platform domain. Shopify
 * handles/admin URLs resolve to `*.myshopify.com`; other hosts are kept as-is
 * because Judge.me also serves non-Shopify storefronts.
 */
export function normalizeJudgemeShopDomain(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const shopify = normalizeShopifyShopDomain(raw);
  if (shopify) return shopify;

  const host = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/, 1)[0]
    ?.toLowerCase();
  return host && host.includes(".") ? host : null;
}

export const JUDGEME_TOKEN_HELP =
  "Judge.me admin → Settings → Integrations → View API tokens (använd den privata token).";
