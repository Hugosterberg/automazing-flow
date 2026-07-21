import { describe, expect, it } from "vitest";
import { parseFortnoxInvoiceQueue, parseFortnoxCreditQueue } from "../../server/lib/fortnoxInvoiceJobs";
import { parseProductContentDrafts } from "../../server/lib/productContentJobs";

describe("parseFortnoxInvoiceQueue", () => {
  it("keeps only well-formed queue items", () => {
    const raw = [
      { id: "1", orderId: "1", orderName: "#1001", customerEmail: "a@b.com", customerName: null, total: 100, currency: "SEK", lineItems: [], status: "suggested", createdAt: "" },
      { id: "bad" }, // missing orderId
      null,
      "not an object",
    ];
    const parsed = parseFortnoxInvoiceQueue(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].orderId).toBe("1");
  });

  it("returns an empty array for non-array input", () => {
    expect(parseFortnoxInvoiceQueue(null)).toEqual([]);
    expect(parseFortnoxInvoiceQueue({})).toEqual([]);
  });
});

describe("parseFortnoxCreditQueue", () => {
  it("keeps only well-formed queue items", () => {
    const raw = [
      {
        id: "r1",
        orderId: "o1",
        refundId: "r1",
        orderName: "#1001",
        invoiceReference: "1001",
        lineItems: [{ title: "Mug", quantity: 1, subtotal: 100 }],
        status: "suggested",
        createdAt: "",
      },
      { id: "bad" }, // missing refundId
    ];
    const parsed = parseFortnoxCreditQueue(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].refundId).toBe("r1");
  });

  it("returns an empty array for non-array input", () => {
    expect(parseFortnoxCreditQueue(null)).toEqual([]);
  });
});

describe("parseProductContentDrafts", () => {
  it("keeps only well-formed draft items", () => {
    const raw = [
      {
        id: "p1",
        productId: "p1",
        productName: "Mug",
        currentDescription: "",
        currentTags: [],
        suggestedDescription: "A great mug.",
        suggestedTags: ["ceramic"],
        status: "draft",
        source: "fallback",
        createdAt: "",
      },
      { id: "bad" }, // missing productId
    ];
    const parsed = parseProductContentDrafts(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].productId).toBe("p1");
  });
});
