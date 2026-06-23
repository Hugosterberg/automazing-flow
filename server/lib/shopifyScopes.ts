const DEFAULT_SHOPIFY_SCOPES = [
  "read_products",
] as const;

export function parseShopifyExtraScopes(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

/**
 * Keep Shopify OAuth installable by default.
 *
 * Scopes such as `read_orders`, `read_customers`, and some checkout/customer data permissions
 * can require extra approval in the Shopify Partner dashboard. Requesting them
 * before approval makes Shopify abort OAuth with `missing_shopify_permission`
 * (for example `customer_read_quick_sale`). Operators can opt into approved
 * extras with SHOPIFY_EXTRA_SCOPES.
 */
export function getShopifyScopes(env: Pick<NodeJS.ProcessEnv, "SHOPIFY_EXTRA_SCOPES"> = process.env): string {
  return [...new Set([...DEFAULT_SHOPIFY_SCOPES, ...parseShopifyExtraScopes(env.SHOPIFY_EXTRA_SCOPES)])].join(",");
}
