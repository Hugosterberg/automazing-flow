import { describe, expect, it } from "vitest";
import {
  alibabaImportToInput,
  emptyProductInput,
  imageFromContentAsset,
  productCoverImage,
  productImageDisplayUrl,
} from "@/lib/productStore";
import type { AlibabaProductImport, Product, ProductImage } from "@/types/ecommerce";
import type { SelectedContentAsset } from "@/lib/contentSelection";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Test",
    description: "",
    price: null,
    currency: null,
    source: "manual",
    sourceUrl: null,
    externalId: null,
    connectedAccountId: null,
    status: null,
    vendor: null,
    productType: null,
    tags: [],
    adminUrl: null,
    specs: [],
    images: [],
    versions: [],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("productImageDisplayUrl", () => {
  it("proxies alibaba images through the server", () => {
    const img: ProductImage = { id: "i", source: "alibaba", url: "https://sc04.alicdn.com/a.jpg" };
    expect(productImageDisplayUrl(img)).toContain("/api/ecommerce/alibaba/image?url=");
    expect(productImageDisplayUrl(img)).toContain(encodeURIComponent(img.url));
  });

  it("returns shopify / content / manual URLs untouched", () => {
    for (const source of ["shopify", "content", "manual"] as const) {
      const img: ProductImage = { id: "i", source, url: "https://cdn.example.com/a.jpg" };
      expect(productImageDisplayUrl(img)).toBe("https://cdn.example.com/a.jpg");
    }
  });

  it("returns null when there is no image or url", () => {
    expect(productImageDisplayUrl(null)).toBeNull();
    expect(productImageDisplayUrl({ id: "i", source: "manual", url: "" })).toBeNull();
  });
});

describe("productCoverImage", () => {
  it("prefers the first gallery image", () => {
    const gallery: ProductImage = { id: "g", source: "manual", url: "g.jpg" };
    const product = makeProduct({ images: [gallery] });
    expect(productCoverImage(product)).toBe(gallery);
  });

  it("falls back to the first version image", () => {
    const versionImage: ProductImage = { id: "v", source: "content", url: "v.jpg" };
    const product = makeProduct({
      versions: [
        { id: "ver0", name: "no image", image: null, createdAt: "" },
        { id: "ver1", name: "has image", image: versionImage, createdAt: "" },
      ],
    });
    expect(productCoverImage(product)).toBe(versionImage);
  });

  it("returns null when there are no images at all", () => {
    expect(productCoverImage(makeProduct())).toBeNull();
  });
});

describe("alibabaImportToInput", () => {
  it("maps an import into a create payload with source 'alibaba'", () => {
    const imported: AlibabaProductImport = {
      sourceUrl: "https://www.alibaba.com/x",
      finalUrl: "https://www.alibaba.com/final",
      title: "Widget",
      description: "A widget",
      price: "12.50",
      currency: "USD",
      images: ["https://sc04.alicdn.com/a.jpg", "https://sc04.alicdn.com/b.jpg"],
      specs: [{ label: "Material", value: "Steel" }],
      warnings: [],
    };
    const input = alibabaImportToInput(imported);
    expect(input.source).toBe("alibaba");
    expect(input.name).toBe("Widget");
    expect(input.sourceUrl).toBe("https://www.alibaba.com/final");
    expect(input.images).toHaveLength(2);
    expect(input.images.every((img) => img.source === "alibaba")).toBe(true);
    expect(input.specs).toEqual([{ label: "Material", value: "Steel" }]);
  });

  it("falls back to a placeholder name when the title is empty", () => {
    const input = alibabaImportToInput({
      sourceUrl: "",
      finalUrl: "",
      title: "",
      description: "",
      price: null,
      currency: null,
      images: [],
      specs: [],
      warnings: [],
    });
    expect(input.name).toBe("Namnlös produkt");
    expect(input.sourceUrl).toBeNull();
  });
});

describe("imageFromContentAsset & emptyProductInput", () => {
  it("builds a content image preferring the preview URL", () => {
    const asset: SelectedContentAsset = {
      id: "a1",
      name: "hero.jpg",
      mimeType: "image/jpeg",
      kind: "image",
      thumbnailUrl: "https://drive/thumb.jpg",
      previewUrl: "https://drive/preview.jpg",
      sourceAccountId: "acc",
      sourceAccountName: "Drive",
    };
    const img = imageFromContentAsset(asset);
    expect(img.source).toBe("content");
    expect(img.url).toBe("https://drive/preview.jpg");
    expect(img.alt).toBe("hero.jpg");
  });

  it("creates an empty manual product input", () => {
    const input = emptyProductInput("  Mug  ", "desc");
    expect(input).toMatchObject({ name: "Mug", description: "desc", source: "manual", images: [], versions: [] });
  });
});
