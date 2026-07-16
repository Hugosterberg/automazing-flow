import { beforeEach, describe, expect, it } from "vitest";
import {
  fulfillmentStatusLabel,
  formatPromoValue,
  orderFiltersStorageKey,
  paymentStatusLabel,
  readPersistedOrderFilters,
} from "@/features/ecommerce/orderDisplay";

describe("paymentStatusLabel / fulfillmentStatusLabel", () => {
  it("maps known Shopify statuses to Swedish labels", () => {
    expect(paymentStatusLabel("paid")).toBe("Betald");
    expect(paymentStatusLabel("partially_paid")).toBe("Delbetald");
    expect(fulfillmentStatusLabel("unfulfilled")).toBe("Ej skickad");
    expect(fulfillmentStatusLabel("fulfilled")).toBe("Skickad");
  });

  it("falls back to the raw status for unknown values", () => {
    expect(paymentStatusLabel("authorized")).toBe("authorized");
    expect(fulfillmentStatusLabel("in_progress")).toBe("in_progress");
  });
});

describe("formatPromoValue", () => {
  it("formats percentage and fixed discounts", () => {
    expect(formatPromoValue("15", "percentage", "SEK")).toBe("15%");
    expect(formatPromoValue("-20", "percentage", "SEK")).toBe("20%");
    expect(formatPromoValue("100", "fixed_amount", "SEK")).toMatch(/100/);
  });

  it("handles missing or non-numeric values", () => {
    expect(formatPromoValue(null, "percentage", "SEK")).toBe("—");
    expect(formatPromoValue("FREE", "fixed_amount", "SEK")).toBe("FREE");
  });
});

describe("orderFiltersStorageKey / readPersistedOrderFilters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("scopes storage keys by profile", () => {
    expect(orderFiltersStorageKey("bp1")).toBe("automazing-ecommerce-order-filters:bp1");
    expect(orderFiltersStorageKey(null)).toBe("automazing-ecommerce-order-filters:default");
  });

  it("returns defaults when nothing is stored", () => {
    expect(readPersistedOrderFilters("bp1")).toEqual({
      payment: "all",
      fulfillment: "all",
    });
  });

  it("reads persisted filters from localStorage", () => {
    localStorage.setItem(
      orderFiltersStorageKey("bp1"),
      JSON.stringify({ payment: "paid", fulfillment: "unfulfilled" })
    );
    expect(readPersistedOrderFilters("bp1")).toEqual({
      payment: "paid",
      fulfillment: "unfulfilled",
    });
  });

  it("defaults corrupt or partial payloads safely", () => {
    localStorage.setItem(orderFiltersStorageKey("bp1"), "{not-json");
    expect(readPersistedOrderFilters("bp1")).toEqual({
      payment: "all",
      fulfillment: "all",
    });

    localStorage.setItem(
      orderFiltersStorageKey("bp1"),
      JSON.stringify({ payment: 1, fulfillment: "partial" })
    );
    expect(readPersistedOrderFilters("bp1")).toEqual({
      payment: "all",
      fulfillment: "partial",
    });
  });
});
