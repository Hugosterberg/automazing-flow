import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessProfile, BusinessProfileInput } from "@/types/businessProfile";

type Row = {
  id: string;
  name: string;
  kind: string | null;
  website: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  owner_user_id: string;
  created_at: string;
  updated_at: string | null;
};

const SELECT =
  "id,name,kind,website,company,email,phone,location,notes,owner_user_id,created_at,updated_at";

function rowToDomain(row: Row): BusinessProfile {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "personal" ? "personal" : "company",
    website: row.website ?? undefined,
    company: row.company ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function inputToRow(input: BusinessProfileInput): Record<string, string | null> {
  const row: Record<string, string | null> = {
    name: input.name.trim(),
    website: input.website?.trim() || null,
    company: input.company?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  // Only written when explicitly provided so partial updates never reset the kind.
  if (input.kind) row.kind = input.kind === "personal" ? "personal" : "company";
  return row;
}

export async function listBusinessProfiles(
  supabase: SupabaseClient
): Promise<BusinessProfile[]> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select(SELECT)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDomain(r as Row));
}

export async function createBusinessProfile(
  supabase: SupabaseClient,
  ownerUserId: string,
  input: BusinessProfileInput
): Promise<BusinessProfile> {
  const payload = {
    ...inputToRow(input),
    owner_user_id: ownerUserId,
  };
  const { data, error } = await supabase
    .from("business_profiles")
    .insert(payload)
    .select(SELECT)
    .single();
  if (error) throw error;
  return rowToDomain(data as Row);
}

export async function updateBusinessProfile(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<BusinessProfileInput>
): Promise<BusinessProfile> {
  const payload = inputToRow({
    name: updates.name ?? "",
    ...updates,
  });
  if (!updates.name) delete payload.name;

  const { data, error } = await supabase
    .from("business_profiles")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return rowToDomain(data as Row);
}

export async function deleteBusinessProfile(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from("business_profiles").delete().eq("id", id);
  if (error) throw error;
}
