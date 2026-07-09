import { apiJson } from "@/lib/apiJson";

export type EnrichmentSourceResult = {
  id: string;
  label: string;
  status: "success" | "skipped" | "error";
  message?: string;
};

export type McpInsight = {
  platform: string;
  provider: string;
  text: string;
};

export type CompanyEnrichment = {
  orgNumber?: string;
  company?: string;
  description?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  location?: string;
  industry?: string;
  companyForm?: string;
  status?: string;
  sniCodes?: Array<{ code: string; label: string }>;
  sources?: EnrichmentSourceResult[];
  mcpInsights?: McpInsight[];
};

export type CompanyEnrichInput = {
  business_profile_id?: string | null;
  orgNumber?: string;
  url?: string;
  company?: string;
  includeMcpResearch?: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  bolagsverket: "Bolagsverket",
  website: "Webbplats",
  google_places: "Google Places",
  mcp_research: "Marknadsresearch",
};

export async function enrichCompany(input: CompanyEnrichInput): Promise<CompanyEnrichment> {
  return apiJson<CompanyEnrichment>("/api/sales/company-enrich", "Kunde inte hämta företagsdata.", {
    body: input,
    timeoutMs: 45_000,
  });
}

export function describeEnrichmentSources(sources: EnrichmentSourceResult[]) {
  return sources.map((s) => {
    const label = SOURCE_LABELS[s.id] || s.label;
    let detail = "OK";
    let tone = "text-success";
    if (s.status === "skipped") {
      tone = "text-muted-foreground";
      detail = s.message || "Ej konfigurerad";
    } else if (s.status === "error") {
      tone = "text-destructive";
      detail = s.message || "Misslyckades";
    } else if (s.message) {
      detail = s.message;
    }
    return { id: s.id, label, detail, tone };
  });
}

export function summarizeEnrichment(data: CompanyEnrichment): string {
  const parts = [
    data.company,
    data.location,
    data.industry,
    data.orgNumber ? `org.nr ${data.orgNumber}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Ingen sammanfattning.";
}

/** Merge enrichment — only fills empty fields unless forceNotes. */
export function applyCompanyEnrichmentToForm<
  T extends {
    orgNumber: string;
    company: string;
    website: string;
    email: string;
    phone: string;
    location: string;
    notes: string;
  },
>(form: T, data: CompanyEnrichment, opts?: { forceNotes?: boolean }): T {
  const sniLine =
    data.sniCodes && data.sniCodes.length > 0
      ? `Bransch: ${data.sniCodes.map((s) => `${s.code} ${s.label}`.trim()).join(", ")}`
      : "";
  const registryNote = [data.description, data.industry && !data.description ? `Bransch: ${data.industry}` : "", sniLine]
    .filter(Boolean)
    .join("\n");

  const notesParts = [form.notes.trim(), registryNote].filter(Boolean);

  return {
    ...form,
    orgNumber: form.orgNumber.trim() || data.orgNumber || form.orgNumber,
    company: form.company.trim() || data.company || form.company,
    website: form.website.trim() || data.website || form.website,
    email: form.email.trim() || data.email || form.email,
    phone: form.phone.trim() || data.phone || form.phone,
    location: form.location.trim() || data.location || form.location,
    notes:
      opts?.forceNotes || !form.notes.trim()
        ? notesParts.join("\n\n").slice(0, 2000)
        : form.notes,
  };
}

/** Apply enrichment to a lead form shape. */
export function applyEnrichmentToLeadForm<
  T extends {
    orgNumber: string;
    company: string;
    website: string;
    email: string;
    phone: string;
    notes: string;
  },
>(form: T, data: CompanyEnrichment): T {
  const noteExtra = [data.description, data.industry ? `Bransch: ${data.industry}` : ""].filter(Boolean).join("\n");
  return {
    ...form,
    orgNumber: form.orgNumber.trim() || data.orgNumber || form.orgNumber,
    company: form.company.trim() || data.company || form.company,
    website: form.website.trim() || data.website || form.website,
    phone: form.phone.trim() || data.phone || form.phone,
    email: form.email.trim() || data.email || form.email,
    notes: form.notes.trim() || noteExtra || form.notes,
  };
}
