import { describe, expect, it } from "vitest";
import { htmlToText, normalizeShopifyProducts } from "../../server/providers/shopify.ts";

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p>Hello&nbsp;&amp; <strong>world</strong></p>")).toBe("Hello & world");
  });

  it("turns <br> and </p> into line breaks", () => {
    expect(htmlToText("<p>line one</p><p>line two<br>line three</p>")).toBe(
      "line one\n\nline two\nline three"
    );
  });

  it("returns empty string for nullish input", () => {
    expect(htmlToText(null)).toBe("");
    expect(htmlToText(undefined)).toBe("");
  });
});

describe("normalizeShopifyProducts", () => {
  const shop = "demo.myshopify.com";

  it("maps core fields, picks first variant price, and builds admin URL", () => {
    const [product] = normalizeShopifyProducts(
      [
        {
          id: 555,
          title: "Bamboo Toothbrush",
          body_html: "<p>Eco friendly</p>",
          handle: "bamboo-toothbrush",
          vendor: "EcoCo",
          product_type: "Personal care",
          tags: "eco, bamboo,  sustainable ",
          status: "active",
          images: [{ src: "https://cdn.shopify.com/a.jpg", alt: "front" }],
          variants: [
            { id: 1, title: "Default Title", price: "49.00", sku: "BT-1" },
            { id: 2, title: "Twin pack", price: "89.00", sku: "BT-2" },
          ],
        },
      ],
      "SEK",
      shop
    );

    expect(product.externalId).toBe("555");
    expect(product.title).toBe("Bamboo Toothbrush");
    expect(product.description).toBe("Eco friendly");
    expect(product.price).toBe("49.00");
    expect(product.currency).toBe("SEK");
    expect(product.vendor).toBe("EcoCo");
    expect(product.productType).toBe("Personal care");
    expect(product.tags).toEqual(["eco", "bamboo", "sustainable"]);
    expect(product.handle).toBe("bamboo-toothbrush");
    expect(product.adminUrl).toBe("https://demo.myshopify.com/admin/products/555");
    expect(product.images).toEqual([{ src: "https://cdn.shopify.com/a.jpg", alt: "front" }]);
  });

  it("drops the placeholder 'Default Title' variant name but keeps real ones", () => {
    const [product] = normalizeShopifyProducts(
      [
        {
          id: 1,
          title: "T",
          variants: [
            { id: 10, title: "Default Title", price: "10" },
            { id: 11, title: "Large", price: "12" },
          ],
        },
      ],
      "USD",
      shop
    );
    expect(product.variants.map((v) => v.title)).toEqual(["", "Large"]);
  });

  it("falls back to the single `image` field when `images` is absent", () => {
    const [product] = normalizeShopifyProducts(
      [{ id: 2, title: "T", image: { src: "https://cdn.shopify.com/x.jpg", alt: null } }],
      "USD",
      shop
    );
    expect(product.images).toEqual([{ src: "https://cdn.shopify.com/x.jpg", alt: null }]);
  });

  it("handles missing optional fields without throwing", () => {
    const [product] = normalizeShopifyProducts([{ id: 9 }], "USD", shop);
    expect(product.title).toBe("Untitled product");
    expect(product.price).toBeNull();
    expect(product.tags).toEqual([]);
    expect(product.images).toEqual([]);
    expect(product.variants).toEqual([]);
  });
});
