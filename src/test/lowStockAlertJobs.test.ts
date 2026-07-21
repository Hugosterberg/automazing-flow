import { describe, expect, it } from "vitest";
import {
  parseAlertedMap,
  pickItemsToAlert,
  type AlertedState,
} from "../../server/lib/lowStockAlertJobs";
import type { ShopifyLowStockItem } from "../../server/providers/shopify";

describe("parseAlertedMap", () => {
  it("keeps only well-formed entries", () => {
    const parsed = parseAlertedMap({
      p1: { quantity: 2, alertedAt: "2026-07-01T00:00:00.000Z" },
      p2: { quantity: "bad" },
      p3: "not an object",
    });
    expect(parsed).toEqual({ p1: { quantity: 2, alertedAt: "2026-07-01T00:00:00.000Z" } });
  });

  it("returns {} for non-object input", () => {
    expect(parseAlertedMap(null)).toEqual({});
    expect(parseAlertedMap([1, 2])).toEqual({});
  });
});

describe("pickItemsToAlert", () => {
  const item = (overrides: Partial<ShopifyLowStockItem> = {}): ShopifyLowStockItem => ({
    productId: "p1",
    productTitle: "Mug",
    quantity: 3,
    status: "low_stock",
    ...overrides,
  });

  it("alerts on a product never seen before", () => {
    expect(pickItemsToAlert([item()], {})).toHaveLength(1);
  });

  it("skips a product alerted recently at the same or better stock level", () => {
    const alerted: Record<string, AlertedState> = {
      p1: { quantity: 3, alertedAt: new Date().toISOString() },
    };
    expect(pickItemsToAlert([item({ quantity: 3 })], alerted)).toHaveLength(0);
    expect(pickItemsToAlert([item({ quantity: 5 })], alerted)).toHaveLength(0);
  });

  it("re-alerts when stock got worse since the last alert", () => {
    const alerted: Record<string, AlertedState> = {
      p1: { quantity: 3, alertedAt: new Date().toISOString() },
    };
    expect(pickItemsToAlert([item({ quantity: 1 })], alerted)).toHaveLength(1);
  });

  it("re-alerts after the throttle window even at steady stock", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    const alerted: Record<string, AlertedState> = { p1: { quantity: 3, alertedAt: eightDaysAgo } };
    expect(pickItemsToAlert([item({ quantity: 3 })], alerted)).toHaveLength(1);
  });
});
