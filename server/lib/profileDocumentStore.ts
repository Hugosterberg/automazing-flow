/**
 * Server-side read/write for `profile_documents` — used by cron jobs that need
 * durable per-profile state (outreach queue, cart recovery dedupe, social workflows).
 */

export interface ProfileDocumentRow {
  id: string;
  business_profile_id: string;
  data: unknown;
}

import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export async function listProfileDocumentsByKey(
  supabaseAdmin: SupabaseAdminLike,
  key: string
): Promise<ProfileDocumentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("profile_documents")
    .select("id,business_profile_id,data")
    .eq("key", key);
  if (error) throw new Error(`profile_documents load failed (${key}): ${error.message}`);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id || ""),
      business_profile_id: String(r.business_profile_id || ""),
      data: r.data,
    };
  });
}

export async function loadProfileDocument(
  supabaseAdmin: SupabaseAdminLike,
  businessProfileId: string,
  key: string
): Promise<ProfileDocumentRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profile_documents")
    .select("id,business_profile_id,data")
    .eq("business_profile_id", businessProfileId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`profile_document load failed (${key}): ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id || ""),
    business_profile_id: String(r.business_profile_id || ""),
    data: r.data,
  };
}

export async function saveProfileDocument(
  supabaseAdmin: SupabaseAdminLike,
  businessProfileId: string,
  key: string,
  data: unknown
): Promise<void> {
  const { error } = await supabaseAdmin.from("profile_documents").upsert(
    {
      business_profile_id: businessProfileId,
      key,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_profile_id,key" }
  );
  if (error) throw new Error(`profile_document save failed (${key}): ${error.message}`);
}

export async function updateProfileDocumentById(
  supabaseAdmin: SupabaseAdminLike,
  docId: string,
  data: unknown
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profile_documents")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", docId);
  if (error) throw new Error(`profile_document update failed: ${error.message}`);
}
