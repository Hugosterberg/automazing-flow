/**
 * Client for the product content automation endpoints (server: ecommerceRoutes).
 * Drafts are AI-suggested description/tag improvements for thin Shopify
 * listings — nothing is written to the catalogue or Shopify until approved.
 */

import { apiJson } from "@/lib/apiJson";

export interface ProductContentDraft {
  id: string;
  productId: string;
  productName: string;
  currentDescription: string;
  currentTags: string[];
  suggestedDescription: string;
  suggestedTags: string[];
  status: "draft" | "applied" | "dismissed";
  source: "openai" | "fallback";
  createdAt: string;
}

export async function fetchProductContentDrafts(
  businessProfileId: string
): Promise<{ drafts: ProductContentDraft[] }> {
  return apiJson(
    `/api/ecommerce/product-content-drafts?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    "Kunde inte ladda produktförslagen."
  );
}

export async function applyProductContentDraft(
  businessProfileId: string,
  productId: string
): Promise<{ ok: boolean; pushedToShopify: boolean }> {
  return apiJson("/api/ecommerce/product-content-drafts/apply", "Kunde inte tillämpa förslaget.", {
    body: { business_profile_id: businessProfileId, productId },
  });
}

export async function dismissProductContentDraft(
  businessProfileId: string,
  productId: string
): Promise<{ ok: boolean }> {
  return apiJson("/api/ecommerce/product-content-drafts/dismiss", "Kunde inte avfärda förslaget.", {
    body: { business_profile_id: businessProfileId, productId },
  });
}
