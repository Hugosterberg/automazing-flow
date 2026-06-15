import { supabase } from "@/lib/supabase";

/**
 * Generic per-profile document store backed by the `profile_documents` table.
 * One JSONB blob per (business_profile_id, key). This is the durable, cross
 * device replacement for the surfaces that used to live in localStorage.
 *
 * The table isn't in the generated Supabase types yet, so we go through a
 * narrow loose-typed view of the client rather than `any`.
 */
type DocRow = { data: unknown } | null;
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: DocRow; error: { message?: string } | null }>;
        };
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message?: string } | null }>;
  };
};

function loose(): LooseClient | null {
  return supabase ? (supabase as unknown as LooseClient) : null;
}

export async function loadProfileDocument<T>(businessProfileId: string, key: string): Promise<T | undefined> {
  const client = loose();
  if (!client) return undefined;
  const { data, error } = await client
    .from("profile_documents")
    .select("data")
    .eq("business_profile_id", businessProfileId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message || "profile_document_load_failed");
  return data && data.data != null ? (data.data as T) : undefined;
}

export async function saveProfileDocument<T>(
  businessProfileId: string,
  key: string,
  data: T,
  userId?: string | null,
): Promise<void> {
  const client = loose();
  if (!client) return;
  const { error } = await client.from("profile_documents").upsert(
    {
      business_profile_id: businessProfileId,
      key,
      data: data as unknown,
      ...(userId ? { created_by: userId } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_profile_id,key" },
  );
  if (error) throw new Error(error.message || "profile_document_save_failed");
}
