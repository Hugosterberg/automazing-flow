/**
 * Client for the product catalogue endpoints (server: productRoutes).
 * All calls are scoped to a business profile via `business_profile_id` and
 * persist to the `products` table — there is no local fallback.
 */

import type { Product, ProductInput } from "@/types/ecommerce";
import { apiJson } from "@/lib/apiJson";

export async function fetchProducts(businessProfileId: string): Promise<Product[]> {
  const payload = await apiJson<{ products: Product[] }>(
    `/api/products?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    "Kunde inte ladda produkter."
  );
  return payload.products ?? [];
}

export async function createProduct(
  businessProfileId: string,
  input: ProductInput
): Promise<Product> {
  const payload = await apiJson<{ product: Product }>("/api/products", "Kunde inte skapa produkten.", {
    body: { business_profile_id: businessProfileId, ...input },
  });
  return payload.product;
}

export async function updateProduct(
  businessProfileId: string,
  id: string,
  patch: Partial<ProductInput>
): Promise<Product> {
  const payload = await apiJson<{ product: Product }>(
    `/api/products/${encodeURIComponent(id)}`,
    "Kunde inte spara produkten.",
    { method: "PUT", body: { business_profile_id: businessProfileId, ...patch } }
  );
  return payload.product;
}

export async function deleteProduct(businessProfileId: string, id: string): Promise<void> {
  await apiJson<{ ok: boolean }>(
    `/api/products/${encodeURIComponent(id)}?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    "Kunde inte ta bort produkten.",
    { method: "DELETE" }
  );
}

export async function importShopifyProducts(
  businessProfileId: string,
  accountId: string
): Promise<{ imported: number; updated: number; products: Product[] }> {
  return apiJson("/api/products/import/shopify", "Kunde inte importera produkter från Shopify.", {
    body: { business_profile_id: businessProfileId, accountId },
  });
}
