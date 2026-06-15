import { describe, expect, it } from "vitest";
import { parseLeadsCsv, leadsToCsv } from "../features/leads/parseLeadsCsv";
import type { Lead } from "../features/leads/leadsService";

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

  it("round-trips through leadsToCsv, escaping special characters", () => {
    const lead = {
      id: "1",
      businessProfileId: "bp",
      company: "Smith, Jones",
      contactName: 'A "B"',
      email: "a@b.com",
      phone: null,
      website: null,
      source: "manual",
      status: "new" as const,
      notes: "important, urgent",
      nextFollowUpAt: null,
      createdAt: "",
      updatedAt: "",
    } satisfies Lead;
    const csv = leadsToCsv([lead]);
    expect(csv.split("\n")[0]).toBe("company,contactName,email,phone,website,status,notes,nextFollowUpAt");
    expect(csv).toContain('"Smith, Jones"');
    expect(csv).toContain('"A ""B"""');
    const reparsed = parseLeadsCsv(csv);
    expect(reparsed.leads[0].company).toBe("Smith, Jones");
    expect(reparsed.leads[0].contactName).toBe('A "B"');
    expect(reparsed.leads[0].notes).toBe("important, urgent");
  });
});
