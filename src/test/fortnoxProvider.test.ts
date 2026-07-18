import { describe, expect, it } from "vitest";
import {
  parseFortnoxInvoiceList,
  summarizeFortnoxInvoices,
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
