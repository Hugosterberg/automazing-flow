const DEFAULT_SHOPIFY_SCOPES = [
  "read_products",
] as const;

/**
 * Customer Account API scopes (customer_read_*, customer_write_*). These belong
 * to Hydrogen/Headless customer login — not Admin OAuth. Requesting them aborts
 * install with missing_shopify_permission (e.g. customer_read_quick_sale).
 */
const CUSTOMER_ACCOUNT_SCOPE_PREFIX = "customer_";

/**
 * Admin scopes that require explicit approval in Shopify Partner Dashboard before
 * OAuth succeeds. Keep them out of SHOPIFY_EXTRA_SCOPES until approved.
 */
export const SHOPIFY_SCOPES_REQUIRING_PARTNER_APPROVAL = [
  "read_all_orders",
  "read_customers",
  "write_customers",
  "read_orders",
  "write_orders",
  "read_checkouts",
  "write_checkouts",
  "read_inventory",
  "write_inventory",
  "write_products",
] as const;

export function parseShopifyExtraScopes(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export type SanitizeShopifyScopesResult = {
  scopes: string[];
  removed: string[];
};

/**
 * Strip scopes that break Admin OAuth or need Partner approval when not configured.
 * Returns removed list so operators can see what was filtered in logs.
 */
export function sanitizeShopifyScopes(scopes: string[]): SanitizeShopifyScopesResult {
  const removed: string[] = [];
  const kept = scopes.filter((scope) => {
    if (scope.startsWith(CUSTOMER_ACCOUNT_SCOPE_PREFIX)) {
      removed.push(scope);
      return false;
    }
    return true;
  });
  return { scopes: kept, removed };
}

/**
 * Keep Shopify OAuth installable by default.
 *
 * Scopes such as `read_orders`, `read_customers`, and some checkout/customer data permissions
 * can require extra approval in the Shopify Partner dashboard. Requesting them
 * before approval makes Shopify abort OAuth with `missing_shopify_permission`
 * (for example `customer_read_quick_sale`). Operators can opt into approved
 * extras with SHOPIFY_EXTRA_SCOPES — never add customer_* scopes there.
 */
export function getShopifyScopes(env: Partial<Pick<NodeJS.ProcessEnv, "SHOPIFY_EXTRA_SCOPES">> = process.env): string {
  const merged = [...new Set([...DEFAULT_SHOPIFY_SCOPES, ...parseShopifyExtraScopes(env.SHOPIFY_EXTRA_SCOPES)])];
  const { scopes } = sanitizeShopifyScopes(merged);
  return scopes.join(",");
}

/** For diagnostics/logging at OAuth start. */
export function getShopifyScopeDiagnostics(
  env: Partial<Pick<NodeJS.ProcessEnv, "SHOPIFY_EXTRA_SCOPES">> = process.env
): SanitizeShopifyScopesResult {
  const merged = [...new Set([...DEFAULT_SHOPIFY_SCOPES, ...parseShopifyExtraScopes(env.SHOPIFY_EXTRA_SCOPES)])];
  return sanitizeShopifyScopes(merged);
}
