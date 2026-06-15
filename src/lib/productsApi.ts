/**
 * Client for the product catalogue endpoints (server: productRoutes).
 * All calls are scoped to a business profile via `business_profile_id` and
 * persist to the `products` table — there is no local fallback.
 */

import { apiUrl } from "@/lib/apiBase";
import type { Product, ProductInput } from "@/types/ecommerce";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

async function parseOrThrow<T>(res: Response, fallbackError: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || payload?.error || fallbackError);
  }
  return payload as T;
}

export async function fetchProducts(businessProfileId: string): Promise<Product[]> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/products?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include" }
  );
  const payload = await parseOrThrow<{ products: Product[] }>(res, "Kunde inte ladda produkter.");
  return payload.products ?? [];
}

export async function createProduct(
  businessProfileId: string,
  input: ProductInput
): Promise<Product> {
  const res = await fetchWithTimeout(apiUrl("/api/products"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, ...input }),
  });
  const payload = await parseOrThrow<{ product: Product }>(res, "Kunde inte skapa produkten.");
  return payload.product;
}

export async function updateProduct(
  businessProfileId: string,
  id: string,
  patch: Partial<ProductInput>
): Promise<Product> {
  const res = await fetchWithTimeout(apiUrl(`/api/products/${encodeURIComponent(id)}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, ...patch }),
  });
  const payload = await parseOrThrow<{ product: Product }>(res, "Kunde inte spara produkten.");
  return payload.product;
}

export async function deleteProduct(businessProfileId: string, id: string): Promise<void> {
  const res = await fetchWithTimeout(
    apiUrl(
      `/api/products/${encodeURIComponent(id)}?business_profile_id=${encodeURIComponent(businessProfileId)}`
    ),
    { method: "DELETE", credentials: "include" }
  );
  await parseOrThrow<{ ok: boolean }>(res, "Kunde inte ta bort produkten.");
}

export async function importShopifyProducts(
  businessProfileId: string,
  accountId: string
): Promise<{ imported: number; updated: number; products: Product[] }> {
  const res = await fetchWithTimeout(apiUrl("/api/products/import/shopify"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, accountId }),
  });
  return parseOrThrow(res, "Kunde inte importera produkter från Shopify.");
}
