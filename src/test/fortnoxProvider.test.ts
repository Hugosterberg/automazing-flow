import { describe, expect, it } from "vitest";
import {
  parseFortnoxInvoiceList,
  summarizeFortnoxInvoices,
  parseFortnoxSupplierInvoiceList,
  parseFortnoxArticleList,
  summarizeFortnoxFinancials,
} from "../../server/providers/fortnox";

const payload = {
  Invoices: [
    {
      DocumentNumber: "1001",
      CustomerName: "Kund AB",
      DueDate: "2026-07-10",
      Total: 1250.5,
      Balance: 1250.5,
      Currency: "SEK",
    },
    {
      DocumentNumber: "1002",
      CustomerName: "Annan Kund",
      DueDate: "2026-07-30",
      Total: 800,
      Balance: 400,
      Currency: "SEK",
    },
  ],
};

describe("parseFortnoxInvoiceList", () => {
  it("normalises the Fortnox invoice list shape", () => {
    const rows = parseFortnoxInvoiceList(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      invoiceNumber: "1001",
      customerName: "Kund AB",
      dueDate: "2026-07-10",
      total: 1250.5,
      balance: 1250.5,
      currency: "SEK",
    });
  });

  it("returns [] on malformed payloads", () => {
    expect(parseFortnoxInvoiceList(null)).toEqual([]);
    expect(parseFortnoxInvoiceList({ Invoices: "nope" })).toEqual([]);
  });
});

describe("summarizeFortnoxInvoices", () => {
  it("splits overdue from unpaid using the balance and ranks overdue first", () => {
    const summary = summarizeFortnoxInvoices(parseFortnoxInvoiceList(payload), "2026-07-18");
    expect(summary.unpaidCount).toBe(2);
    expect(summary.unpaidSum).toBe(1650.5);
    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueSum).toBe(1250.5);
    expect(summary.currency).toBe("SEK");
    expect(summary.invoices[0]?.invoiceNumber).toBe("1001");
  });

  it("handles an empty invoice list", () => {
    const summary = summarizeFortnoxInvoices([], "2026-07-18");
    expect(summary).toMatchObject({ unpaidCount: 0, overdueCount: 0, unpaidSum: 0, overdueSum: 0 });
  });
});

describe("parseFortnoxSupplierInvoiceList", () => {
  it("normalises the Fortnox supplier invoice list shape", () => {
    const rows = parseFortnoxSupplierInvoiceList({
      SupplierInvoices: [
        {
          GivenNumber: "42",
          SupplierName: "Leverantör AB",
          InvoiceNumber: "S-100",
          DueDate: "2026-08-01",
          Total: 500,
          Balance: 500,
          Currency: "SEK",
        },
      ],
    });
    expect(rows).toEqual([
      {
        givenNumber: "42",
        supplierName: "Leverantör AB",
        invoiceNumber: "S-100",
        dueDate: "2026-08-01",
        total: 500,
        balance: 500,
        currency: "SEK",
      },
    ]);
  });

  it("returns [] on malformed payloads", () => {
    expect(parseFortnoxSupplierInvoiceList(null)).toEqual([]);
    expect(parseFortnoxSupplierInvoiceList({ SupplierInvoices: "nope" })).toEqual([]);
  });
});

describe("parseFortnoxArticleList", () => {
  it("normalises the Fortnox article list shape", () => {
    const articles = parseFortnoxArticleList({
      Articles: [{ ArticleNumber: "A1", Description: "T-shirt", SalesPrice: "199.00" }],
    });
    expect(articles).toEqual([{ articleNumber: "A1", description: "T-shirt", salesPrice: 199 }]);
  });

  it("returns [] on malformed payloads", () => {
    expect(parseFortnoxArticleList(undefined)).toEqual([]);
  });
});

describe("summarizeFortnoxFinancials", () => {
  it("buckets account balances by BAS chart-of-accounts class", () => {
    const snapshot = summarizeFortnoxFinancials({
      Accounts: [
        { Number: 3010, Balance: -10000 }, // revenue (credit balance, negative in Fortnox convention)
        { Number: 4010, Balance: 4000 }, // cost of goods
        { Number: 5010, Balance: 1000 }, // other costs
        { Number: 1930, Balance: 5000 }, // bank (asset)
        { Number: 2440, Balance: -2000 }, // accounts payable (liability)
        { Number: 0, Balance: 999 }, // invalid account number, ignored
      ],
    });
    expect(snapshot.revenue).toBe(10000);
    expect(snapshot.costs).toBe(5000);
    expect(snapshot.resultEstimate).toBe(5000);
    expect(snapshot.assets).toBe(5000);
    expect(snapshot.equityAndLiabilities).toBe(2000);
  });

  it("handles an empty account list", () => {
    const snapshot = summarizeFortnoxFinancials({ Accounts: [] });
    expect(snapshot).toMatchObject({ revenue: 0, costs: 0, resultEstimate: 0, assets: 0, equityAndLiabilities: 0 });
  });
});
