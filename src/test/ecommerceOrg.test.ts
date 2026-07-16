import { describe, expect, it } from "vitest";
import {
  isNotionData,
  isShopifyData,
  sortOrgAccounts,
  type NotionData,
  type ShopifyData,
} from "@/features/ecommerce/ecommerceOrg";
import type { ConnectedAccount } from "@/types/accounts";

function account(
  partial: Pick<ConnectedAccount, "platform" | "username">
): ConnectedAccount {
  return {
    id: partial.username,
    profileId: "p1",
    platform: partial.platform,
    username: partial.username,
    connectedAt: "2026-01-01T00:00:00Z",
  };
}

describe("sortOrgAccounts", () => {
  it("orders Shopify before Notion, then by username", () => {
    const accounts = [
      account({ platform: "notion", username: "z-workspace" }),
      account({ platform: "gmail", username: "me@example.com" }),
      account({ platform: "shopify", username: "b-store" }),
      account({ platform: "shopify", username: "a-store" }),
      account({ platform: "notion", username: "a-workspace" }),
    ];
    const sorted = [...accounts].sort(sortOrgAccounts);
    expect(sorted.map((a) => a.username)).toEqual([
      "a-store",
      "b-store",
      "a-workspace",
      "z-workspace",
      "me@example.com",
    ]);
  });
});

describe("isShopifyData / isNotionData", () => {
  const shopify = {
    shop: { name: "Store" },
    orders: [],
  } as unknown as ShopifyData;

  const notion = {
    workspace: { name: "WS" },
    pages: [],
  } as unknown as NotionData;

  it("narrows organization payloads by shape", () => {
    expect(isShopifyData(shopify)).toBe(true);
    expect(isShopifyData(notion)).toBe(false);
    expect(isShopifyData(null)).toBe(false);

    expect(isNotionData(notion)).toBe(true);
    expect(isNotionData(shopify)).toBe(false);
    expect(isNotionData(null)).toBe(false);
  });
});
