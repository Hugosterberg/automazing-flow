/**
 * Product content automation — flags Shopify-synced products with a thin
 * description or no tags, drafts an AI-improved version, and queues it for
 * approval. Nothing is written back to the catalogue or Shopify until the
 * user explicitly applies a draft (see `applyProductContentDraft`).
 *
 * State lives in a `profile_documents` doc (same pattern as the other flow
 * queues — outreach, review-reply, mail-reply) rather than a new table: one
 * draft per product, keyed by the product's `products.id`.
 */

import { generateProductCopy } from "../ai/productCopy.ts";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentStore.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export const PRODUCT_CONTENT_DRAFTS_DOC_KEY = "product-content-drafts";

export interface ProductContentDraftItem {
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

interface TokenStoreLike {
  get(accountId: string): Promise<Record<string, unknown> | null | undefined>;
}

const THIN_DESCRIPTION_CHARS = 40;
const MAX_PRODUCTS_PER_RUN = 5;
const MAX_DRAFTS_STORED = 200;

export function parseProductContentDrafts(data: unknown): ProductContentDraftItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is ProductContentDraftItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as ProductContentDraftItem).id === "string" &&
      typeof (e as ProductContentDraftItem).productId === "string"
  );
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  vendor: string | null;
  product_type: string | null;
  status: string | null;
  external_id: string | null;
  connected_account_id: string | null;
}

const PRODUCT_COLS = "id,name,description,tags,vendor,product_type,status,external_id,connected_account_id";

/**
 * Scan a tenant's Shopify-synced catalogue for products worth improving,
 * draft AI copy for a handful of them, and queue the drafts. A product is
 * only ever considered once (any prior draft — pending, applied, or
 * dismissed — excludes it from future runs) so re-running doesn't nag about
 * the same product forever.
 */
export async function runProductContentAutomation(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  resolveOpenAiKey: (businessProfileId: string) => Promise<string | null>;
}): Promise<{ drafted: number; skipped: number; scanned: number }> {
  const { supabaseAdmin, businessProfileId } = deps;

  const { data: productRows, error } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_COLS)
    .eq("business_profile_id", businessProfileId)
    .eq("source", "shopify");
  if (error) throw new Error(`products lookup failed: ${error.message}`);
  const products = (Array.isArray(productRows) ? productRows : []) as unknown as ProductRow[];
  if (products.length === 0) return { drafted: 0, skipped: 0, scanned: 0 };

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, PRODUCT_CONTENT_DRAFTS_DOC_KEY);
  const drafts = parseProductContentDrafts(doc?.data);
  const handledIds = new Set(drafts.map((d) => d.productId));

  const candidates = products
    .filter((p) => !handledIds.has(p.id))
    .filter((p) => !p.status || p.status === "active")
    .filter((p) => {
      const descLen = String(p.description || "").trim().length;
      const tagsEmpty = !Array.isArray(p.tags) || p.tags.length === 0;
      return descLen < THIN_DESCRIPTION_CHARS || tagsEmpty;
    })
    .slice(0, MAX_PRODUCTS_PER_RUN);

  if (candidates.length === 0) return { drafted: 0, skipped: products.length, scanned: products.length };

  const openaiKey = await deps.resolveOpenAiKey(businessProfileId);
  const newDrafts: ProductContentDraftItem[] = [];
  for (const p of candidates) {
    const copy = await generateProductCopy(
      {
        title: p.name,
        description: p.description || "",
        vendor: p.vendor,
        productType: p.product_type,
        tags: Array.isArray(p.tags) ? p.tags : [],
      },
      openaiKey
    );
    newDrafts.push({
      id: p.id,
      productId: p.id,
      productName: p.name,
      currentDescription: p.description || "",
      currentTags: Array.isArray(p.tags) ? p.tags : [],
      suggestedDescription: copy.description,
      suggestedTags: copy.tags,
      status: "draft",
      source: copy.source,
      createdAt: new Date().toISOString(),
    });
  }

  const nextDrafts = [...newDrafts, ...drafts].slice(0, MAX_DRAFTS_STORED);
  await saveProfileDocument(supabaseAdmin, businessProfileId, PRODUCT_CONTENT_DRAFTS_DOC_KEY, nextDrafts);

  return {
    drafted: newDrafts.length,
    skipped: products.length - candidates.length,
    scanned: products.length,
  };
}

/**
 * Apply an approved draft: writes the suggested description/tags to the
 * local `products` row and, when the product is tied to a connected Shopify
 * account, pushes the same update to the live store.
 */
export async function applyProductContentDraft(deps: {
  supabaseAdmin: SupabaseAdminLike;
  tokenStore: TokenStoreLike;
  businessProfileId: string;
  productId: string;
  updateShopifyProductContent: (
    accessToken: string,
    shop: string | undefined,
    productId: string,
    input: { description?: string; tags?: string[] }
  ) => Promise<{ ok: true } | { error: string; status: number }>;
}): Promise<{ ok: true; pushedToShopify: boolean } | { ok: false; error: string }> {
  const { supabaseAdmin, tokenStore, businessProfileId, productId } = deps;

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, PRODUCT_CONTENT_DRAFTS_DOC_KEY);
  const drafts = parseProductContentDrafts(doc?.data);
  const draft = drafts.find((d) => d.productId === productId && d.status === "draft");
  if (!draft) return { ok: false, error: "draft_not_found" };

  const { data: productRow, error: productError } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_COLS)
    .eq("id", productId)
    .eq("business_profile_id", businessProfileId)
    .maybeSingle();
  if (productError) return { ok: false, error: productError.message };
  const product = productRow as unknown as ProductRow | null;
  if (!product) return { ok: false, error: "product_not_found" };

  let pushedToShopify = false;
  if (product.connected_account_id && product.external_id) {
    const stored = await tokenStore.get(product.connected_account_id);
    const accessToken = String(stored?.accessToken || "").trim();
    const shop = String(stored?.shop || "").trim();
    if (accessToken && shop) {
      const result = await deps.updateShopifyProductContent(accessToken, shop, product.external_id, {
        description: draft.suggestedDescription,
        tags: draft.suggestedTags,
      });
      if ("error" in result) {
        return { ok: false, error: result.error };
      }
      pushedToShopify = true;
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({ description: draft.suggestedDescription, tags: draft.suggestedTags })
    .eq("id", productId)
    .eq("business_profile_id", businessProfileId);
  if (updateError) return { ok: false, error: updateError.message };

  const nextDrafts = drafts.map((d) => (d.productId === productId ? { ...d, status: "applied" as const } : d));
  await saveProfileDocument(supabaseAdmin, businessProfileId, PRODUCT_CONTENT_DRAFTS_DOC_KEY, nextDrafts);

  return { ok: true, pushedToShopify };
}

export async function dismissProductContentDraft(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  productId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin, businessProfileId, productId } = deps;
  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, PRODUCT_CONTENT_DRAFTS_DOC_KEY);
  const drafts = parseProductContentDrafts(doc?.data);
  if (!drafts.some((d) => d.productId === productId)) {
    return { ok: false, error: "draft_not_found" };
  }
  const nextDrafts = drafts.map((d) => (d.productId === productId ? { ...d, status: "dismissed" as const } : d));
  await saveProfileDocument(supabaseAdmin, businessProfileId, PRODUCT_CONTENT_DRAFTS_DOC_KEY, nextDrafts);
  return { ok: true };
}
