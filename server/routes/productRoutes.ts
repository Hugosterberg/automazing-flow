/**
 * Product catalogue: per-profile CRUD plus a Shopify sync that mirrors a
 * connected store's products into our `products` table.
 *
 * All endpoints are membership-gated (`requireMembership` attaches
 * `req.businessProfileId` + `req.membershipRole`). Writes are blocked for
 * viewers. Rows are owned by the server (service role); RLS denies direct
 * client access. Same shape as automationRoutes.
 */

import { fetchShopifyProducts, type NormalizedShopifyProduct } from "../providers/shopify.ts";
import { accountInBusinessProfile } from "../lib/profileScope.ts";
import type { SupabaseAdminLike } from "../lib/supabaseAdminLike.ts";

interface ProductRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: SupabaseAdminLike | null;
  getSessionUserId: (req: unknown) => string | null;
  getStoredAccountAccess: (
    stored: Record<string, unknown>,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
  tokenStore: {
    get: (id: string) => Promise<Record<string, unknown> | null | undefined>;
  };
}

const ROW_COLUMNS =
  "id,name,description,price,currency,source,source_url,external_id,connected_account_id,status,vendor,product_type,tags,specs,images,versions,metadata,created_at,updated_at";

const VALID_SOURCES = new Set(["manual", "alibaba", "shopify", "content"]);
const MAX_IMAGES = 30;
const MAX_VERSIONS = 50;
const MAX_SPECS = 60;

function canManage(role: unknown): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

function asString(value: unknown, max = 5000): string {
  return String(value ?? "").slice(0, max);
}

function nullableString(value: unknown, max = 2000): string | null {
  if (value == null) return null;
  const s = String(value).slice(0, max).trim();
  return s ? s : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeImages(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_IMAGES)
    .map((img) => {
      const o = (img ?? {}) as Record<string, unknown>;
      const url = String(o.url ?? "").slice(0, 4000);
      if (!url) return null;
      const source = String(o.source ?? "manual");
      return {
        id: asString(o.id, 80) || `img_${Math.random().toString(36).slice(2)}`,
        source: ["content", "alibaba", "shopify", "manual"].includes(source) ? source : "manual",
        url,
        ...(o.alt ? { alt: asString(o.alt, 300) } : {}),
      };
    })
    .filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeVersions(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_VERSIONS)
    .map((ver) => {
      const o = (ver ?? {}) as Record<string, unknown>;
      const name = asString(o.name, 200).trim();
      if (!name) return null;
      const images = sanitizeImages(o.image ? [o.image] : []);
      return {
        id: asString(o.id, 80) || `ver_${Math.random().toString(36).slice(2)}`,
        name,
        image: images[0] ?? null,
        ...(o.note ? { note: asString(o.note, 500) } : {}),
        createdAt: asString(o.createdAt, 40) || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeSpecs(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_SPECS)
    .map((spec) => {
      const o = (spec ?? {}) as Record<string, unknown>;
      const label = asString(o.label, 200).trim();
      const val = asString(o.value, 1000).trim();
      if (!label && !val) return null;
      return { label, value: val };
    })
    .filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price: row.price ?? null,
    currency: row.currency ?? null,
    source: row.source ?? "manual",
    sourceUrl: row.source_url ?? null,
    externalId: row.external_id ?? null,
    connectedAccountId: row.connected_account_id ?? null,
    status: row.status ?? null,
    vendor: row.vendor ?? null,
    productType: row.product_type ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    specs: Array.isArray(row.specs) ? row.specs : [],
    images: Array.isArray(row.images) ? row.images : [],
    versions: Array.isArray(row.versions) ? row.versions : [],
    adminUrl: typeof metadata.adminUrl === "string" ? metadata.adminUrl : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shopifyProductToImages(product: NormalizedShopifyProduct) {
  return product.images.slice(0, MAX_IMAGES).map((img, i) => ({
    id: `img_shopify_${product.externalId}_${i}`,
    source: "shopify" as const,
    url: img.src,
    ...(img.alt ? { alt: img.alt } : {}),
  }));
}

function shopifyProductToVersions(product: NormalizedShopifyProduct) {
  return product.variants
    .filter((v) => v.title)
    .slice(0, MAX_VERSIONS)
    .map((v) => ({
      id: `ver_shopify_${v.id}`,
      name: v.title,
      image: null,
      note: [v.sku ? `SKU ${v.sku}` : "", v.price ? `${v.price} ${product.currency}` : ""]
        .filter(Boolean)
        .join(" · "),
      createdAt: new Date().toISOString(),
    }));
}

export function registerProductRoutes(app, deps: ProductRoutesDeps) {
  const { requireMembership, supabaseAdmin, getSessionUserId, getStoredAccountAccess, tokenStore } = deps;

  app.get("/api/products", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.json({ storeEnabled: false, products: [] });
    const businessProfileId = String(req.businessProfileId || "").trim();
    try {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select(ROW_COLUMNS)
        .eq("business_profile_id", businessProfileId)
        .order("updated_at", { ascending: false });
      if (error) {
        console.warn("[products] list failed:", error.message);
        return res.status(500).json({ error: "products_load_failed" });
      }
      return res.json({ storeEnabled: true, products: (data || []).map(rowToProduct) });
    } catch (e) {
      console.error("[products] list unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "products_load_failed" });
    }
  });

  app.post("/api/products", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    if (!canManage(req.membershipRole)) return res.status(403).json({ error: "forbidden_role" });

    const businessProfileId = String(req.businessProfileId || "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = asString(body.name, 300).trim();
    if (!name) return res.status(400).json({ error: "missing_name", message: "Produktnamn saknas." });

    const source = VALID_SOURCES.has(String(body.source)) ? String(body.source) : "manual";
    const row = {
      business_profile_id: businessProfileId,
      name,
      description: asString(body.description, 20000),
      price: nullableString(body.price, 100),
      currency: nullableString(body.currency, 20),
      source,
      source_url: nullableString(body.sourceUrl, 2000),
      specs: sanitizeSpecs(body.specs),
      images: sanitizeImages(body.images),
      versions: sanitizeVersions(body.versions),
      created_by: getSessionUserId(req),
    };

    try {
      const { data, error } = await supabaseAdmin.from("products").insert(row).select(ROW_COLUMNS).single();
      if (error) {
        console.warn("[products] create failed:", error.message);
        return res.status(500).json({ error: "product_create_failed" });
      }
      return res.json({ product: rowToProduct(data) });
    } catch (e) {
      console.error("[products] create unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "product_create_failed" });
    }
  });

  app.put("/api/products/:id", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    if (!canManage(req.membershipRole)) return res.status(403).json({ error: "forbidden_role" });

    const businessProfileId = String(req.businessProfileId || "").trim();
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ error: "missing_id" });

    const body = (req.body ?? {}) as Record<string, unknown>;
    // Build a patch from only the fields the client actually sent so partial
    // updates don't wipe untouched columns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {};
    if ("name" in body) {
      const name = asString(body.name, 300).trim();
      if (!name) return res.status(400).json({ error: "missing_name" });
      patch.name = name;
    }
    if ("description" in body) patch.description = asString(body.description, 20000);
    if ("price" in body) patch.price = nullableString(body.price, 100);
    if ("currency" in body) patch.currency = nullableString(body.currency, 20);
    if ("sourceUrl" in body) patch.source_url = nullableString(body.sourceUrl, 2000);
    if ("specs" in body) patch.specs = sanitizeSpecs(body.specs);
    if ("images" in body) patch.images = sanitizeImages(body.images);
    if ("versions" in body) patch.versions = sanitizeVersions(body.versions);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "empty_patch" });

    try {
      const { data, error } = await supabaseAdmin
        .from("products")
        .update(patch)
        .eq("id", id)
        .eq("business_profile_id", businessProfileId)
        .select(ROW_COLUMNS)
        .maybeSingle();
      if (error) {
        console.warn("[products] update failed:", error.message);
        return res.status(500).json({ error: "product_update_failed" });
      }
      if (!data) return res.status(404).json({ error: "product_not_found" });
      return res.json({ product: rowToProduct(data) });
    } catch (e) {
      console.error("[products] update unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "product_update_failed" });
    }
  });

  app.delete("/api/products/:id", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    if (!canManage(req.membershipRole)) return res.status(403).json({ error: "forbidden_role" });

    const businessProfileId = String(req.businessProfileId || "").trim();
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ error: "missing_id" });

    try {
      const { error } = await supabaseAdmin
        .from("products")
        .delete()
        .eq("id", id)
        .eq("business_profile_id", businessProfileId);
      if (error) {
        console.warn("[products] delete failed:", error.message);
        return res.status(500).json({ error: "product_delete_failed" });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("[products] delete unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "product_delete_failed" });
    }
  });

  // Mirror a connected Shopify store's catalogue into `products`. Re-running
  // is idempotent: new products are inserted, already-synced ones refresh their
  // Shopify-owned fields (name, price, status, images, …) while preserving the
  // user's edited description and any versions they added.
  app.post("/api/products/import/shopify", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_service_role_not_configured" });
    if (!canManage(req.membershipRole)) return res.status(403).json({ error: "forbidden_role" });

    const businessProfileId = String(req.businessProfileId || "").trim();
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "not_authenticated" });

    const accountId = String((req.body as Record<string, unknown>)?.accountId || "").trim();
    if (!accountId) return res.status(400).json({ error: "missing_account_id" });

    const stored = await tokenStore.get(accountId);
    if (!stored) return res.status(404).json({ error: "account_not_connected" });
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) return res.status(403).json({ error: "forbidden_account" });
    if (stored.platform !== "shopify") {
      return res.status(400).json({ error: "not_a_shopify_account" });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) {
      return res.status(404).json({ error: "account_not_connected_for_business_profile" });
    }

    const result = await fetchShopifyProducts(
      String(stored.accessToken || ""),
      String(stored.shop || "")
    );
    if ("error" in result) {
      return res.status(result.status || 502).json({ error: "shopify_fetch_failed", message: result.error });
    }

    try {
      const externalIds = result.products.map((p) => p.externalId);
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("products")
        .select("id,external_id")
        .eq("business_profile_id", businessProfileId)
        .eq("connected_account_id", accountId)
        .in("external_id", externalIds.length > 0 ? externalIds : ["__none__"]);
      if (existingError) {
        console.warn("[products] shopify existing lookup failed:", existingError.message);
        return res.status(500).json({ error: "product_sync_failed" });
      }
      const existingByExternal = new Map<string, string>(
        (existing || []).map((r: { external_id: string; id: string }) => [r.external_id, r.id])
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserts: any[] = [];
      const updates: Array<Promise<unknown>> = [];

      for (const product of result.products) {
        const images = shopifyProductToImages(product);
        const shopifyFields = {
          name: product.title,
          price: product.price,
          currency: product.currency,
          status: product.status,
          vendor: product.vendor,
          product_type: product.productType,
          tags: product.tags,
          source_url: product.adminUrl,
          images,
          metadata: { adminUrl: product.adminUrl, handle: product.handle },
        };
        const existingId = existingByExternal.get(product.externalId);
        if (existingId) {
          // Preserve user-owned description/versions/specs on re-sync.
          updates.push(
            supabaseAdmin.from("products").update(shopifyFields).eq("id", existingId)
          );
        } else {
          inserts.push({
            business_profile_id: businessProfileId,
            source: "shopify",
            external_id: product.externalId,
            connected_account_id: accountId,
            description: product.description,
            specs: [],
            versions: shopifyProductToVersions(product),
            created_by: userId,
            ...shopifyFields,
          });
        }
      }

      if (inserts.length > 0) {
        const { error: insertError } = await supabaseAdmin.from("products").insert(inserts);
        if (insertError) {
          console.warn("[products] shopify insert failed:", insertError.message);
          return res.status(500).json({ error: "product_sync_failed" });
        }
      }
      if (updates.length > 0) {
        const settled = await Promise.all(updates);
        const failed = settled.find((r) => (r as { error?: unknown })?.error);
        if (failed) {
          console.warn("[products] shopify update failed:", (failed as { error?: { message?: string } }).error?.message);
        }
      }

      const { data: all, error: listError } = await supabaseAdmin
        .from("products")
        .select(ROW_COLUMNS)
        .eq("business_profile_id", businessProfileId)
        .order("updated_at", { ascending: false });
      if (listError) {
        return res.status(500).json({ error: "products_load_failed" });
      }
      return res.json({
        ok: true,
        imported: inserts.length,
        updated: updates.length,
        products: (all || []).map(rowToProduct),
      });
    } catch (e) {
      console.error("[products] shopify sync unexpected:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "product_sync_failed" });
    }
  });
}
