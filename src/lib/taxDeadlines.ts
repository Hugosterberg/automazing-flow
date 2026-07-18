/**
 * Viktiga myndighetsdatum — rule engine for Skatteverket/Bolagsverket
 * deadlines. Skatteverket's real APIs require signed partner agreements, but
 * the deadline rules themselves are public and stable, so we compute them
 * from the company's tax settings instead of fetching.
 *
 * Simplifications (documented in the UI as "vägledande"):
 * - Declaration day is the 12th (17th in January and August); dates falling
 *   on a weekend roll forward to Monday. Public-holiday rolls are not
 *   modelled.
 * - Monthly VAT uses the small-company schedule (12th of the second month
 *   after the period) — companies above 40 MSEK revenue file on the 26th.
 * - Income declaration dates use Skatteverket's paper deadlines (digital
 *   filing adds roughly one month).
 */

export type CompanyForm = "ab" | "enskild";
export type VatPeriod = "monthly" | "quarterly" | "yearly" | "none";

export type TaxSettings = {
  companyForm: CompanyForm;
  vatPeriod: VatPeriod;
  /** Company has employees → monthly arbetsgivardeklaration (AGI). */
  employer: boolean;
  /** Month (1-12) the fiscal year ends. 12 = calendar year. */
  fiscalYearEndMonth: number;
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  companyForm: "ab",
  vatPeriod: "quarterly",
  employer: false,
  fiscalYearEndMonth: 12,
};

export type TaxDeadlineKind = "moms" | "agi" | "arsredovisning" | "inkomstdeklaration";

export type TaxDeadline = {
  /** YYYY-MM-DD, weekend-rolled. */
  date: string;
  kind: TaxDeadlineKind;
  agency: "skatteverket" | "bolagsverket";
  /** Stable per-occurrence id, e.g. "moms-2026-q2". */
  id: string;
  /** Period the deadline covers, for display (e.g. "apr–jun 2026"). */
  periodLabel: string;
};

function iso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Saturday/Sunday deadlines roll forward to the next weekday. */
export function rollWeekend(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Skatteverket's declaration day: 12th, except January & August → 17th. */
export function declarationDay(year: number, month: number): string {
  const day = month === 1 || month === 8 ? 17 : 12;
  return rollWeekend(iso(year, month, day));
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

const MONTH_LABELS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? String(month);
}

/**
 * Paper deadline for Inkomstdeklaration 2 (AB) by fiscal-year-end month:
 * jan–apr → 1 nov same year, maj–jun → 15 dec same year,
 * jul–aug → 1 mar next year, sep–dec → 1 jul next year.
 */
export function incomeDeclaration2Date(fyEndYear: number, fyEndMonth: number): string {
  if (fyEndMonth <= 4) return rollWeekend(iso(fyEndYear, 11, 1));
  if (fyEndMonth <= 6) return rollWeekend(iso(fyEndYear, 12, 15));
  if (fyEndMonth <= 8) return rollWeekend(iso(fyEndYear + 1, 3, 1));
  return rollWeekend(iso(fyEndYear + 1, 7, 1));
}

/**
 * All deadlines in [fromDate, fromDate + horizonDays], sorted ascending.
 * Pure: pass today's date in; callers slice the next N for display.
 */
export function upcomingTaxDeadlines(
  settings: TaxSettings,
  fromDate: string,
  horizonDays = 400
): TaxDeadline[] {
  const fromTs = Date.parse(`${fromDate}T00:00:00Z`);
  if (!Number.isFinite(fromTs)) return [];
  const toTs = fromTs + horizonDays * 24 * 60 * 60 * 1000;
  const startYear = Number(fromDate.slice(0, 4)) - 1;
  const endYear = Number(fromDate.slice(0, 4)) + 2;
  const fyEnd = Math.min(12, Math.max(1, Math.trunc(settings.fiscalYearEndMonth) || 12));
  const deadlines: TaxDeadline[] = [];

  const push = (deadline: TaxDeadline) => {
    const ts = Date.parse(`${deadline.date}T00:00:00Z`);
    if (Number.isFinite(ts) && ts >= fromTs && ts <= toTs) deadlines.push(deadline);
  };

  for (let year = startYear; year <= endYear; year++) {
    if (settings.employer) {
      for (let month = 1; month <= 12; month++) {
        const period = addMonths(year, month, -1);
        push({
          date: declarationDay(year, month),
          kind: "agi",
          agency: "skatteverket",
          id: `agi-${year}-${String(month).padStart(2, "0")}`,
          periodLabel: `${monthLabel(period.month)} ${period.year}`,
        });
      }
    }

    if (settings.vatPeriod === "monthly") {
      for (let month = 1; month <= 12; month++) {
        const period = addMonths(year, month, -2);
        push({
          date: declarationDay(year, month),
          kind: "moms",
          agency: "skatteverket",
          id: `moms-${year}-${String(month).padStart(2, "0")}`,
          periodLabel: `${monthLabel(period.month)} ${period.year}`,
        });
      }
    } else if (settings.vatPeriod === "quarterly") {
      // Quarters end Mar/Jun/Sep/Dec; filing is the 12th of the second month after.
      for (const quarterEnd of [3, 6, 9, 12]) {
        const filing = addMonths(year, quarterEnd, 2);
        const startMonth = quarterEnd - 2;
        push({
          date: declarationDay(filing.year, filing.month),
          kind: "moms",
          agency: "skatteverket",
          id: `moms-${year}-q${quarterEnd / 3}`,
          periodLabel: `${monthLabel(startMonth)}–${monthLabel(quarterEnd)} ${year}`,
        });
      }
    } else if (settings.vatPeriod === "yearly") {
      // Helårsmoms (no EU trade): AB files the 26th of the second month after
      // FY end; enskild firma files with the income declaration (12 May).
      if (settings.companyForm === "enskild") {
        push({
          date: rollWeekend(iso(year + 1, 5, 12)),
          kind: "moms",
          agency: "skatteverket",
          id: `moms-${year}-year`,
          periodLabel: `räkenskapsår ${year}`,
        });
      } else {
        const filing = addMonths(year, fyEnd, 2);
        push({
          date: rollWeekend(iso(filing.year, filing.month, 26)),
          kind: "moms",
          agency: "skatteverket",
          id: `moms-${year}-year`,
          periodLabel: `räkenskapsår t.o.m. ${monthLabel(fyEnd)} ${year}`,
        });
      }
    }

    if (settings.companyForm === "ab") {
      const annualReport = addMonths(year, fyEnd, 7);
      push({
        date: rollWeekend(lastDayOfMonth(annualReport.year, annualReport.month)),
        kind: "arsredovisning",
        agency: "bolagsverket",
        id: `arsredovisning-${year}`,
        periodLabel: `räkenskapsår t.o.m. ${monthLabel(fyEnd)} ${year}`,
      });
      push({
        date: incomeDeclaration2Date(year, fyEnd),
        kind: "inkomstdeklaration",
        agency: "skatteverket",
        id: `ink2-${year}`,
        periodLabel: `räkenskapsår t.o.m. ${monthLabel(fyEnd)} ${year}`,
      });
    } else {
      push({
        date: rollWeekend(iso(year, 5, 2)),
        kind: "inkomstdeklaration",
        agency: "skatteverket",
        id: `ink1-${year}`,
        periodLabel: `inkomstår ${year - 1}`,
      });
    }
  }

  return deadlines.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function isTaxSettings(value: unknown): value is TaxSettings {
  const v = value as TaxSettings | null;
  return Boolean(
    v &&
      (v.companyForm === "ab" || v.companyForm === "enskild") &&
      ["monthly", "quarterly", "yearly", "none"].includes(v.vatPeriod) &&
      typeof v.employer === "boolean" &&
      Number.isFinite(v.fiscalYearEndMonth)
  );
}
