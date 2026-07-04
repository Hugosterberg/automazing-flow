import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

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
  const res = await fetchWithTimeout(
    apiUrl("/api/sales/marketing-playbook"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    35_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't load playbook ideas."));
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
