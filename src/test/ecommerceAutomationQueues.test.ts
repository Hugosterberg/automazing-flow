import { describe, expect, it } from "vitest";
import { parseFortnoxInvoiceQueue } from "../../server/lib/fortnoxInvoiceJobs";
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
