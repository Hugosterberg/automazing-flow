import type { LeadInput } from "./leadsService";

/** Split one CSV line into fields, honouring double-quoted values with commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const HEADER_ALIASES: Record<keyof LeadInput, string[]> = {
  company: ["company", "företag", "foretag", "organization", "organisation", "business", "account"],
  contactName: ["contact", "contact name", "kontakt", "name", "namn", "person", "full name"],
  email: ["email", "e-mail", "mail", "e-post", "epost"],
  phone: ["phone", "telefon", "tel", "mobile", "mobil", "phone number"],
  website: ["website", "url", "webbplats", "site", "web", "hemsida"],
  notes: ["notes", "note", "anteckningar", "comment", "comments", "description"],
  source: ["source", "källa", "kalla"],
  status: [],
  nextFollowUpAt: [],
};

function matchColumn(header: string): keyof LeadInput | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[keyof LeadInput, string[]]>) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

export interface ParsedLeadsCsv {
  leads: LeadInput[];
  /** Rows skipped because they had no company/name to key on. */
  skipped: number;
}

/**
 * Parse a CSV of prospects into lead inputs. Maps common English/Swedish column
 * names to lead fields; when there's no recognised company column, the first
 * column is used as the company. Rows without a company are skipped.
 */
export function parseLeadsCsv(text: string, maxRows = 500): ParsedLeadsCsv {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { leads: [], skipped: 0 };

  const headers = splitCsvLine(lines[0]);
  const mapping = headers.map(matchColumn);
  const hasCompanyColumn = mapping.includes("company");

  const leads: LeadInput[] = [];
  let skipped = 0;
  for (const line of lines.slice(1, maxRows + 1)) {
    const cells = splitCsvLine(line);
    const lead: Partial<LeadInput> = { source: "csv-import" };
    cells.forEach((value, i) => {
      const field = mapping[i];
      if (!field || !value) return;
      if (field === "status" || field === "nextFollowUpAt") return;
      (lead as Record<string, string>)[field] = value;
    });
    // No company column? Fall back to the first non-empty cell.
    if (!hasCompanyColumn && !lead.company) {
      const first = cells.find((c) => c.trim());
      if (first) lead.company = first;
    }
    if (!lead.company || !lead.company.trim()) {
      skipped += 1;
      continue;
    }
    leads.push({ ...lead, company: lead.company.trim() } as LeadInput);
  }
  return { leads, skipped };
}
