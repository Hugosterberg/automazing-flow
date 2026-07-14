import { describe, expect, it } from "vitest";
import {
  getShopifyScopes,
  parseShopifyExtraScopes,
  sanitizeShopifyScopes,
} from "../../server/lib/shopifyScopes.ts";

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

  it("strips Customer Account API scopes that break Admin OAuth", () => {
    expect(
      getShopifyScopes({
        SHOPIFY_EXTRA_SCOPES: "read_orders, customer_read_quick_sale, customer_read_customers",
      })
    ).toBe("read_products,read_orders");
  });

  it("sanitizeShopifyScopes reports removed customer scopes", () => {
    expect(
      sanitizeShopifyScopes(["read_products", "customer_read_quick_sale", "read_orders"])
    ).toEqual({
      scopes: ["read_products", "read_orders"],
      removed: ["customer_read_quick_sale"],
    });
  });
});
