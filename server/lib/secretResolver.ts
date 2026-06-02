/**
 * Per-tenant secret resolution with global env fallback.
 *
 * Resolution order for `resolve(businessProfileId, key)`:
 *   1. per-tenant value in `integration_secrets` (decrypted), when present
 *   2. global `process.env[key]`
 *
 * This keeps existing single-tenant behaviour working (env fallback) while
 * letting each business_profile bring its own keys. Writes require both a
 * Supabase service-role client and an encryption key; when either is missing
 * (e.g. local dev without service role) reads degrade to env-only and writes
 * throw a clear, catchable error.
 *
 * The table is service-role only (RLS denies anon/authenticated), so all access
 * funnels through here. A short in-memory TTL cache avoids hammering Supabase on
 * warm instances; it is invalidated on write.
 */

import type { SecretCrypto, EncryptedSecret } from "./secretCrypto.ts";

interface SupabaseLike {
  from(table: string): {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        };
        order: (col: string, opts: { ascending: boolean }) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

export interface SecretResolverDeps {
  supabaseAdmin: SupabaseLike | null;
  crypto: SecretCrypto | null;
  /** cache lifetime in ms (default 30s) */
  cacheTtlMs?: number;
}

export interface SecretResolver {
  enabled: boolean;
  resolve(businessProfileId: string | null | undefined, key: string): Promise<string | null>;
  setSecret(businessProfileId: string, key: string, value: string, updatedBy?: string | null): Promise<void>;
  deleteSecret(businessProfileId: string, key: string): Promise<void>;
  listConfiguredKeys(businessProfileId: string): Promise<string[]>;
}

const TABLE = "integration_secrets";

function envValue(key: string): string | null {
  const v = String(process.env[key] || "").trim();
  return v.length > 0 ? v : null;
}

export function createSecretResolver(deps: SecretResolverDeps): SecretResolver {
  const { supabaseAdmin, crypto } = deps;
  const ttl = deps.cacheTtlMs ?? 30_000;
  const enabled = Boolean(supabaseAdmin && crypto);

  // cacheKey -> { value, expiresAt }. value === null means "no per-tenant row".
  const cache = new Map<string, { value: string | null; expiresAt: number }>();
  const cacheKey = (bp: string, key: string) => `${bp}::${key}`;

  function invalidate(bp: string, key: string) {
    cache.delete(cacheKey(bp, key));
  }

  async function readTenantValue(bp: string, key: string): Promise<string | null> {
    if (!enabled) return null;
    const ck = cacheKey(bp, key);
    const cached = cache.get(ck);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const { data, error } = await supabaseAdmin!
      .from(TABLE)
      .select("value_ciphertext, value_iv, value_tag")
      .eq("business_profile_id", bp)
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.warn("[secretResolver] read failed:", error.message);
      return null; // fall back to env on lookup error
    }

    let value: string | null = null;
    if (data) {
      const row = data as { value_ciphertext?: string; value_iv?: string; value_tag?: string };
      if (row.value_ciphertext && row.value_iv && row.value_tag) {
        try {
          value = crypto!.decrypt({
            ciphertext: row.value_ciphertext,
            iv: row.value_iv,
            tag: row.value_tag,
          } as EncryptedSecret);
        } catch (e) {
          console.warn("[secretResolver] decrypt failed:", e instanceof Error ? e.message : e);
          value = null;
        }
      }
    }

    cache.set(ck, { value, expiresAt: Date.now() + ttl });
    return value;
  }

  async function resolve(
    businessProfileId: string | null | undefined,
    key: string
  ): Promise<string | null> {
    const bp = String(businessProfileId || "").trim();
    if (bp && enabled) {
      const tenantValue = await readTenantValue(bp, key);
      if (tenantValue && tenantValue.trim().length > 0) return tenantValue.trim();
    }
    return envValue(key);
  }

  async function setSecret(
    businessProfileId: string,
    key: string,
    value: string,
    updatedBy?: string | null
  ): Promise<void> {
    if (!enabled) {
      throw new Error("secret_store_unavailable");
    }
    const bp = String(businessProfileId || "").trim();
    if (!bp) throw new Error("missing_business_profile_id");

    const enc = crypto!.encrypt(String(value ?? ""));
    const { error } = await supabaseAdmin!.from(TABLE).upsert(
      {
        business_profile_id: bp,
        key,
        value_ciphertext: enc.ciphertext,
        value_iv: enc.iv,
        value_tag: enc.tag,
        updated_by: updatedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_profile_id,key" }
    );
    if (error) throw new Error(error.message);
    invalidate(bp, key);
  }

  async function deleteSecret(businessProfileId: string, key: string): Promise<void> {
    if (!enabled) {
      throw new Error("secret_store_unavailable");
    }
    const bp = String(businessProfileId || "").trim();
    const { error } = await supabaseAdmin!.from(TABLE).delete().eq("business_profile_id", bp).eq("key", key);
    if (error) throw new Error(error.message);
    invalidate(bp, key);
  }

  async function listConfiguredKeys(businessProfileId: string): Promise<string[]> {
    if (!enabled) return [];
    const bp = String(businessProfileId || "").trim();
    if (!bp) return [];
    const { data, error } = await supabaseAdmin!
      .from(TABLE)
      .select("key")
      .eq("business_profile_id", bp)
      .order("key", { ascending: true });
    if (error) {
      console.warn("[secretResolver] listConfiguredKeys failed:", error.message);
      return [];
    }
    const rows = Array.isArray(data) ? (data as Array<{ key?: string }>) : [];
    return rows.map((r) => String(r.key || "")).filter(Boolean);
  }

  return { enabled, resolve, setSecret, deleteSecret, listConfiguredKeys };
}
