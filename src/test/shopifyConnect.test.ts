import { describe, expect, it } from "vitest";
import { normalizeShopifyShopDomain } from "@/features/ecommerce/shopifyConnect";

describe("normalizeShopifyShopDomain", () => {
  it("keeps myshopify domains in the format Shopify OAuth expects", () => {
    expect(normalizeShopifyShopDomain("https://MyStore.myshopify.com/admin")).toBe("mystore.myshopify.com");
  });

  it("accepts a plain Shopify store handle", () => {
    expect(normalizeShopifyShopDomain("my-store")).toBe("my-store.myshopify.com");
  });

  it("extracts the handle from modern Shopify Admin URLs", () => {
    expect(normalizeShopifyShopDomain("https://admin.shopify.com/store/my-store/settings/domains")).toBe(
      "my-store.myshopify.com"
    );
  });

  it("rejects custom storefront domains because OAuth needs the myshopify domain", () => {
    expect(normalizeShopifyShopDomain("example.com")).toBeNull();
  });
});
