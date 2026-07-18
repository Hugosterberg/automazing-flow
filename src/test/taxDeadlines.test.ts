import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAX_SETTINGS,
  declarationDay,
  incomeDeclaration2Date,
  isTaxSettings,
  rollWeekend,
  upcomingTaxDeadlines,
  type TaxSettings,
} from "@/lib/taxDeadlines";

const AB_QUARTERLY: TaxSettings = {
  companyForm: "ab",
  vatPeriod: "quarterly",
  employer: false,
  fiscalYearEndMonth: 12,
};

describe("rollWeekend / declarationDay", () => {
  it("rolls Saturday and Sunday forward to Monday", () => {
    // 2026-05-02 is a Saturday, 2026-05-03 a Sunday.
    expect(rollWeekend("2026-05-02")).toBe("2026-05-04");
    expect(rollWeekend("2026-05-03")).toBe("2026-05-04");
    expect(rollWeekend("2026-05-04")).toBe("2026-05-04");
  });

  it("uses the 12th, the 17th in January and August, and rolls weekends", () => {
    expect(declarationDay(2026, 2)).toBe("2026-02-12");
    expect(declarationDay(2026, 1)).toBe("2026-01-19"); // 17 jan 2026 is a Saturday
    expect(declarationDay(2026, 8)).toBe("2026-08-17");
    expect(declarationDay(2026, 9)).toBe("2026-09-14"); // 12 sep 2026 is a Saturday
  });
});

describe("incomeDeclaration2Date", () => {
  it("maps fiscal-year ends to Skatteverket's filing periods", () => {
    expect(incomeDeclaration2Date(2025, 12)).toBe("2026-07-01");
    expect(incomeDeclaration2Date(2026, 4)).toBe("2026-11-02"); // 1 nov 2026 is a Sunday
    expect(incomeDeclaration2Date(2026, 6)).toBe("2026-12-15");
    expect(incomeDeclaration2Date(2026, 8)).toBe("2027-03-01");
  });
});

describe("upcomingTaxDeadlines", () => {
  it("produces quarterly VAT, annual report and INK2 for a calendar-year AB", () => {
    const deadlines = upcomingTaxDeadlines(AB_QUARTERLY, "2026-07-18", 60);
    // Q2 (apr–jun) VAT files 17 Aug (August uses the 17th); annual report for
    // FY 2025 is due 31 Jul; INK2 paper deadline for FY 2025 was 1 Jul (past).
    expect(deadlines.map((d) => `${d.kind}:${d.date}`)).toEqual([
      "arsredovisning:2026-07-31",
      "moms:2026-08-17",
    ]);
    expect(deadlines[0]?.agency).toBe("bolagsverket");
    expect(deadlines[1]?.periodLabel).toBe("apr–jun 2026");
  });

  it("adds monthly AGI when the company is an employer", () => {
    const deadlines = upcomingTaxDeadlines(
      { ...AB_QUARTERLY, employer: true },
      "2026-02-01",
      20
    );
    expect(deadlines.some((d) => d.kind === "agi" && d.date === "2026-02-12")).toBe(true);
    expect(deadlines.find((d) => d.kind === "agi")?.periodLabel).toBe("jan 2026");
  });

  it("skips VAT entirely when not VAT registered", () => {
    const deadlines = upcomingTaxDeadlines(
      { ...AB_QUARTERLY, vatPeriod: "none" },
      "2026-01-01",
      365
    );
    expect(deadlines.some((d) => d.kind === "moms")).toBe(false);
  });

  it("gives enskild firma INK1 on 2 May (weekend-rolled) and no annual report", () => {
    const deadlines = upcomingTaxDeadlines(
      { companyForm: "enskild", vatPeriod: "none", employer: false, fiscalYearEndMonth: 12 },
      "2026-04-01",
      60
    );
    expect(deadlines).toEqual([
      {
        date: "2026-05-04",
        kind: "inkomstdeklaration",
        agency: "skatteverket",
        id: "ink1-2026",
        periodLabel: "inkomstår 2025",
      },
    ]);
  });

  it("respects the horizon and returns sorted dates", () => {
    const deadlines = upcomingTaxDeadlines({ ...AB_QUARTERLY, employer: true }, "2026-01-01", 365);
    const dates = deadlines.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.every((d) => d >= "2026-01-01" && d <= "2027-01-01")).toBe(true);
  });
});

describe("isTaxSettings", () => {
  it("validates persisted settings shapes", () => {
    expect(isTaxSettings(DEFAULT_TAX_SETTINGS)).toBe(true);
    expect(isTaxSettings(null)).toBe(false);
    expect(isTaxSettings({ companyForm: "ab" })).toBe(false);
  });
});
