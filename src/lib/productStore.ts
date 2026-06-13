import { apiUrl } from "@/lib/apiBase";
import type {
  AlibabaProductImport,
  Product,
  ProductImage,
  ProductInput,
} from "@/types/ecommerce";
import type { SelectedContentAsset } from "@/lib/contentSelection";

/**
 * Cryptographically-random id when available, with a timestamp+counter
 * fallback so versions/images created in the same tick never collide. Used
 * client-side for nested JSON (images, versions); product rows get their id
 * from the database.
 */
let idCounter = 0;
export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * Resolve a {@link ProductImage} to a URL safe to drop into an `<img>` src.
 * Alibaba images can't be hotlinked, so they go through the server proxy;
 * everything else (Shopify CDN, Drive thumbnails, manual URLs) renders direct.
 */
export function productImageDisplayUrl(image: ProductImage | null | undefined): string | null {
  if (!image?.url) return null;
  if (image.source === "alibaba") {
    return apiUrl(`/api/ecommerce/alibaba/image?url=${encodeURIComponent(image.url)}`);
  }
  return image.url;
}

/** The first usable image for a product, used as its catalogue cover. */
export function productCoverImage(product: Product): ProductImage | null {
  if (product.images.length > 0) return product.images[0];
  const versionWithImage = product.versions.find((version) => version.image);
  return versionWithImage?.image ?? null;
}

export function imageFromContentAsset(asset: SelectedContentAsset): ProductImage {
  return {
    id: createId("img"),
    source: "content",
    url: asset.previewUrl || asset.thumbnailUrl,
    alt: asset.name,
  };
}

function imageFromAlibabaUrl(url: string): ProductImage {
  return { id: createId("img"), source: "alibaba", url };
}

/** Build a create payload from an Alibaba/1688 import. */
export function alibabaImportToInput(item: AlibabaProductImport): ProductInput {
  return {
    name: item.title || "Namnlös produkt",
    description: item.description || "",
    price: item.price,
    currency: item.currency,
    source: "alibaba",
    sourceUrl: item.finalUrl || item.sourceUrl || null,
    specs: item.specs ?? [],
    images: (item.images ?? []).map(imageFromAlibabaUrl),
    versions: [],
  };
}

export function emptyProductInput(name: string, description = ""): ProductInput {
  return {
    name: name.trim() || "Namnlös produkt",
    description,
    price: null,
    currency: null,
    source: "manual",
    sourceUrl: null,
    specs: [],
    images: [],
    versions: [],
  };
}
