import { describe, expect, it } from "vitest";
import { parseLeadsCsv } from "../features/leads/parseLeadsCsv";

describe("parseLeadsCsv", () => {
  it("maps recognised columns (English + Swedish) to lead fields", () => {
    const csv = [
      "Company,Contact,Email,Phone,Website",
      'Acme AB,Anna Berg,anna@acme.se,+46 70 123,acme.se',
      "Globex,,info@globex.com,,globex.com",
    ].join("\n");
    const { leads, skipped } = parseLeadsCsv(csv);
    expect(skipped).toBe(0);
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({
      company: "Acme AB",
      contactName: "Anna Berg",
      email: "anna@acme.se",
      website: "acme.se",
      source: "csv-import",
    });
    expect(leads[1].company).toBe("Globex");
  });

  it("honours quoted fields containing commas", () => {
    const csv = ['Company,Notes', '"Smith, Jones & Co","Big client, priority"'].join("\n");
    const { leads } = parseLeadsCsv(csv);
    expect(leads[0].company).toBe("Smith, Jones & Co");
    expect(leads[0].notes).toBe("Big client, priority");
  });

  it("falls back to the first column as company when none is recognised", () => {
    const csv = ["Org,Region", "Northwind,EU"].join("\n");
    const { leads } = parseLeadsCsv(csv);
    expect(leads[0].company).toBe("Northwind");
  });

  it("skips rows with no company", () => {
    const csv = ["Company,Email", ",nobody@x.com", "Real Co,a@b.com"].join("\n");
    const { leads, skipped } = parseLeadsCsv(csv);
    expect(leads).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("returns empty for a header-only or blank file", () => {
    expect(parseLeadsCsv("Company,Email").leads).toEqual([]);
    expect(parseLeadsCsv("").leads).toEqual([]);
  });
});
