export type AlibabaProductImport = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  price: string | null;
  currency: string | null;
  images: string[];
  specs: Array<{ label: string; value: string }>;
  warnings: string[];
};

export type ShopifyDraftProductResult = {
  product: {
    id: number | string;
    title: string;
    status: string;
    adminUrl: string;
  };
};

/**
 * Where a product image originated. `content` images come from a Google
 * Drive asset tagged in the Content page; `alibaba` images come from an
 * Alibaba/1688 import and must be proxied for display; `manual` is a raw URL.
 */
export type ProductImageSource = "content" | "alibaba" | "shopify" | "manual";

export type ProductSource = "manual" | "alibaba" | "shopify" | "content";

export type ProductImage = {
  id: string;
  source: ProductImageSource;
  /**
   * The raw source URL. For `content` this is a Drive thumbnail/preview URL,
   * for `alibaba` the original product image URL (proxied at render time),
   * for `manual` a user-supplied URL.
   */
  url: string;
  alt?: string;
};

/**
 * A named variant of a product — e.g. a colourway, a packaging revision or
 * simply a tagged Content image. Each version optionally carries its own
 * image so a single product can hold several visual takes.
 */
export type ProductVersion = {
  id: string;
  name: string;
  image: ProductImage | null;
  note?: string;
  createdAt: string;
};

/**
 * A product the user sells. Built up from Alibaba imports, Content-tagged
 * images, or by hand. The description is always editable regardless of
 * where the initial copy was sourced.
 */
export type Product = {
  id: string;
  name: string;
  description: string;
  price: string | null;
  currency: string | null;
  source: ProductSource;
  sourceUrl: string | null;
  externalId: string | null;
  connectedAccountId: string | null;
  status: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  adminUrl: string | null;
  specs: Array<{ label: string; value: string }>;
  images: ProductImage[];
  versions: ProductVersion[];
  createdAt: string;
  updatedAt: string;
};

/** Writable fields accepted when creating a product via the API. */
export type ProductInput = {
  name: string;
  description: string;
  price: string | null;
  currency: string | null;
  source: ProductSource;
  sourceUrl: string | null;
  specs: Array<{ label: string; value: string }>;
  images: ProductImage[];
  versions: ProductVersion[];
};
