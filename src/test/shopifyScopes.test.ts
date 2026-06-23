import { describe, expect, it } from "vitest";
import { getShopifyScopes, parseShopifyExtraScopes } from "../../server/lib/shopifyScopes.ts";

describe("Shopify OAuth scopes", () => {
  it("defaults to installable baseline scopes", () => {
    expect(getShopifyScopes({ SHOPIFY_EXTRA_SCOPES: "" })).toBe("read_products");
  });

  it("supports approved optional scopes through env", () => {
    expect(getShopifyScopes({ SHOPIFY_EXTRA_SCOPES: "write_products, read_orders read_inventory" })).toBe(
      "read_products,write_products,read_orders,read_inventory"
    );
  });

  it("parses comma and whitespace separated extras", () => {
    expect(parseShopifyExtraScopes("read_customers, read_checkouts read_inventory")).toEqual([
      "read_customers",
      "read_checkouts",
      "read_inventory",
    ]);
  });
});
