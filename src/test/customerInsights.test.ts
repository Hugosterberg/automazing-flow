import { describe, expect, it } from "vitest";
import { parseNumeric, summarizeCustomers } from "../features/customers/customerInsights";

describe("parseNumeric", () => {
  it("handles currency symbols and SV/EN separators", () => {
    expect(parseNumeric("1 234,56")).toBeCloseTo(1234.56);
    expect(parseNumeric("$1,234.56")).toBeCloseTo(1234.56);
    expect(parseNumeric("kr 500")).toBe(500);
    expect(parseNumeric("not a number")).toBeNull();
    expect(parseNumeric("")).toBeNull();
  });
});

describe("summarizeCustomers", () => {
  const columns = ["Name", "Email", "Total spent"];
  const rows = [
    { Name: "A", Email: "a@x.com", "Total spent": "1 000" },
    { Name: "B", Email: "b@x.com", "Total spent": "500" },
    { Name: "C", Email: "", "Total spent": "250" },
  ];

  it("counts customers, detects the email column, and sums numeric columns", () => {
    const s = summarizeCustomers(columns, rows);
    expect(s.total).toBe(3);
    expect(s.emailColumn).toBe("Email");
    expect(s.emailCount).toBe(2);
    const spent = s.numericColumns.find((c) => c.name === "Total spent");
    expect(spent?.sum).toBe(1750);
    expect(spent?.avg).toBeCloseTo(1750 / 3);
  });

  it("detects an email column by content when the header is unhelpful", () => {
    const s = summarizeCustomers(["X", "Contact"], [
      { X: "1", Contact: "a@x.com" },
      { X: "2", Contact: "b@x.com" },
    ]);
    expect(s.emailColumn).toBe("Contact");
    expect(s.emailCount).toBe(2);
  });

  it("ignores mostly-text columns as non-numeric", () => {
    const s = summarizeCustomers(["City"], [{ City: "Malmö" }, { City: "Lund" }]);
    expect(s.numericColumns).toHaveLength(0);
  });
});
