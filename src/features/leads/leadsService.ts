import { supabase } from "@/lib/supabase";
import type { LeadStatus } from "./leadHelpers";

export interface Lead {
  id: string;
  businessProfileId: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  orgNumber?: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadInput {
  company: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  orgNumber?: string | null;
  source?: string | null;
  status?: LeadStatus;
  notes?: string | null;
  nextFollowUpAt?: string | null;
}

// `leads` isn't in the generated Supabase types yet, so route through a loose
// view of the client (same approach as profile_documents).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the migration
type LeadsClient = { from: (table: string) => any };
function client(): LeadsClient | null {
  return supabase ? (supabase as unknown as LeadsClient) : null;
}

function rowToLead(r: Record<string, unknown>): Lead {
  return {
    id: String(r.id),
    businessProfileId: String(r.business_profile_id),
    company: String(r.company || ""),
    contactName: (r.contact_name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    orgNumber: (r.org_number as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    status: (r.status as LeadStatus) ?? "new",
    notes: (r.notes as string | null) ?? null,
    nextFollowUpAt: (r.next_follow_up_at as string | null) ?? null,
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
  };
}

function inputToRow(input: Partial<LeadInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.company !== undefined) row.company = input.company.trim();
  if (input.contactName !== undefined) row.contact_name = input.contactName?.trim() || null;
  if (input.email !== undefined) row.email = input.email?.trim() || null;
  if (input.phone !== undefined) row.phone = input.phone?.trim() || null;
  if (input.website !== undefined) row.website = input.website?.trim() || null;
  if (input.orgNumber !== undefined) row.org_number = input.orgNumber?.trim() || null;
  if (input.source !== undefined) row.source = input.source?.trim() || null;
  if (input.status !== undefined) row.status = input.status;
  if (input.notes !== undefined) row.notes = input.notes?.trim() || null;
  if (input.nextFollowUpAt !== undefined) row.next_follow_up_at = input.nextFollowUpAt || null;
  return row;
}

export async function listLeads(businessProfileId: string): Promise<Lead[]> {
  const c = client();
  if (!c) return [];
  const { data, error } = await c
    .from("leads")
    .select("*")
    .eq("business_profile_id", businessProfileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "leads_list_failed");
  return Array.isArray(data) ? data.map(rowToLead) : [];
}

export async function createLead(
  businessProfileId: string,
  input: LeadInput,
  createdBy: string | null,
): Promise<Lead> {
  const c = client();
  if (!c) throw new Error("Not signed in.");
  const { data, error } = await c
    .from("leads")
    .insert({ business_profile_id: businessProfileId, created_by: createdBy, ...inputToRow(input) })
    .select("*")
    .single();
  if (error) throw new Error(error.message || "lead_create_failed");
  return rowToLead(data);
}

export async function createLeads(
  businessProfileId: string,
  inputs: LeadInput[],
  createdBy: string | null,
): Promise<number> {
  const c = client();
  if (!c) throw new Error("Not signed in.");
  const rows = inputs
    .filter((i) => i.company && i.company.trim())
    .map((i) => ({ business_profile_id: businessProfileId, created_by: createdBy, ...inputToRow(i) }));
  if (rows.length === 0) return 0;
  const { error } = await c.from("leads").insert(rows);
  if (error) throw new Error(error.message || "leads_import_failed");
  return rows.length;
}

export async function updateLead(id: string, patch: Partial<LeadInput>): Promise<Lead> {
  const c = client();
  if (!c) throw new Error("Not signed in.");
  const { data, error } = await c.from("leads").update(inputToRow(patch)).eq("id", id).select("*").single();
  if (error) throw new Error(error.message || "lead_update_failed");
  return rowToLead(data);
}

export async function deleteLead(id: string): Promise<void> {
  const c = client();
  if (!c) throw new Error("Not signed in.");
  const { error } = await c.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message || "lead_delete_failed");
}
