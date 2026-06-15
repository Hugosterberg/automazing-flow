export interface NumericColumnSummary {
  name: string;
  sum: number;
  avg: number;
  count: number;
}

export interface CustomerInsights {
  total: number;
  emailColumn: string | null;
  emailCount: number;
  numericColumns: NumericColumnSummary[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Parse a cell into a number, tolerating currency symbols and SV/EN separators. */
export function parseNumeric(value: string): number | null {
  if (!value) return null;
  let t = value.replace(/[^\d.,-]/g, "").trim();
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, ""); // 1,234.56 → thousands
  else if (t.includes(",")) t = t.replace(",", "."); // 1234,56 → decimal comma
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function looksLikeEmailColumn(name: string): boolean {
  return /e-?mail|e-?post/i.test(name);
}

/**
 * Heuristic insights over an uploaded customer table: total rows, the email
 * column + how many have a valid address, and any column that's mostly numeric
 * (summed + averaged). Pure and unit-tested.
 */
export function summarizeCustomers(columns: string[], rows: Array<Record<string, string>>): CustomerInsights {
  const total = rows.length;

  // Email column: header match first, else the column with the most email-like values.
  let emailColumn: string | null = columns.find(looksLikeEmailColumn) ?? null;
  if (!emailColumn) {
    let bestCol: string | null = null;
    let bestHits = 0;
    for (const col of columns) {
      const hits = rows.reduce((n, r) => n + (EMAIL_RE.test((r[col] || "").trim()) ? 1 : 0), 0);
      if (hits > bestHits) {
        bestHits = hits;
        bestCol = col;
      }
    }
    if (bestHits >= Math.max(1, total * 0.3)) emailColumn = bestCol;
  }
  const emailCount = emailColumn
    ? rows.reduce((n, r) => n + (EMAIL_RE.test((r[emailColumn!] || "").trim()) ? 1 : 0), 0)
    : 0;

  // Numeric columns: ≥60% of non-empty values parse as numbers.
  const numericColumns: NumericColumnSummary[] = [];
  for (const col of columns) {
    if (col === emailColumn) continue;
    let nonEmpty = 0;
    let numeric = 0;
    let sum = 0;
    for (const r of rows) {
      const raw = (r[col] || "").trim();
      if (!raw) continue;
      nonEmpty += 1;
      const n = parseNumeric(raw);
      if (n != null) {
        numeric += 1;
        sum += n;
      }
    }
    if (nonEmpty > 0 && numeric / nonEmpty >= 0.6 && numeric > 0) {
      numericColumns.push({ name: col, sum, avg: sum / numeric, count: numeric });
    }
  }
  // Most-summed columns first (likely revenue/value), cap at 4.
  numericColumns.sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));

  return { total, emailColumn, emailCount, numericColumns: numericColumns.slice(0, 4) };
}
