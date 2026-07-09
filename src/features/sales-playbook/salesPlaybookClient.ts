import { apiJson } from "@/lib/apiJson";

export type SalesPlaybookMode =
  | "pitch-angles"
  | "cold-outreach"
  | "objections"
  | "campaigns"
  | "channels"
  | "promotions";

export interface SalesPlaybookItem {
  title: string;
  body: string;
  detail: string;
  category: string;
}

export interface SalesPlaybookInput {
  business_profile_id?: string | null;
  mode?: SalesPlaybookMode;
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  industry?: string;
}

export async function fetchSalesPlaybookItems(
  input: SalesPlaybookInput
): Promise<{ items: SalesPlaybookItem[]; source: string; mode: SalesPlaybookMode }> {
  const body = await apiJson<{ items?: unknown; source?: unknown; mode?: SalesPlaybookMode }>(
    "/api/sales/marketing-playbook",
    "Couldn't load playbook ideas.",
    { body: input, timeoutMs: 35_000 }
  );
  const modes: SalesPlaybookMode[] = [
    "pitch-angles",
    "cold-outreach",
    "objections",
    "campaigns",
    "channels",
    "promotions",
  ];
  const mode = modes.includes(body.mode) ? (body.mode as SalesPlaybookMode) : "pitch-angles";
  return {
    items: Array.isArray(body.items) ? (body.items as SalesPlaybookItem[]) : [],
    source: String(body.source || ""),
    mode,
  };
}
