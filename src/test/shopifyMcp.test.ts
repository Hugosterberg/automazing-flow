import { describe, expect, it } from "vitest";
import {
  normalizeShopifyShopDomain,
  shopifyStorefrontMcpUrl,
} from "../../server/lib/shopifyShopDomain.ts";

describe("normalizeShopifyShopDomain", () => {
  it("accepts bare handles and full myshopify domains", () => {
    expect(normalizeShopifyShopDomain("my-store")).toBe("my-store.myshopify.com");
    expect(normalizeShopifyShopDomain("https://MyStore.myshopify.com/admin")).toBe("mystore.myshopify.com");
  });

  it("rejects non-shopify hosts", () => {
    expect(normalizeShopifyShopDomain("example.com")).toBeNull();
  });
});

describe("shopifyStorefrontMcpUrl", () => {
  it("builds the public Storefront MCP endpoint", () => {
    expect(shopifyStorefrontMcpUrl("demo.myshopify.com")).toBe("https://demo.myshopify.com/api/mcp");
  });
});

describe("shopify_mcp directory contract", () => {
  it("registers shopify_mcp as a keyed MCP provider", async () => {
    const { KEYED_MCP_DIRECTORY, isKeyedMcpPlatform } = await import(
      "../../server/providers/mcpDirectory.ts"
    );
    expect(isKeyedMcpPlatform("shopify_mcp")).toBe(true);
    expect(KEYED_MCP_DIRECTORY.shopify_mcp.keyPlacement).toEqual({ type: "shop_domain" });
    expect(KEYED_MCP_DIRECTORY.shopify_mcp.profileUrl).toBe("https://setup.shopify.com/mcp");
  });
});
